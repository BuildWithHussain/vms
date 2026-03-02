import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.request import urlretrieve

import frappe
import requests
from frappe import _

from vms.r2 import generate_presigned_download_url

WHISPER_BINARY = "whisper-cli"
MODEL_CACHE_DIR = Path(frappe.get_site_path()) / ".cache" / "whispercpp"
HUGGINGFACE_BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main"


def ensure_whisper_installed():
	"""Check if whisper-cli is available on the system PATH."""
	return shutil.which(WHISPER_BINARY) is not None


def get_model_path(model_name: str = "ggml-small.en") -> Path:
	"""Get the path where a whisper model should be stored."""
	filename = f"{model_name}.bin"
	return MODEL_CACHE_DIR / filename


def ensure_model_downloaded(model_name: str = "ggml-small.en") -> Path:
	"""Download the whisper model if it doesn't exist locally."""
	model_path = get_model_path(model_name)

	if model_path.exists():
		return model_path

	MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

	filename = f"{model_name}.bin"
	url = f"{HUGGINGFACE_BASE}/{filename}"

	frappe.logger().info(f"Downloading whisper model from {url} to {model_path}")
	urlretrieve(url, str(model_path))
	frappe.logger().info(f"Model downloaded: {model_path}")

	return model_path


def extract_audio(video_path: str, output_path: str) -> None:
	"""Extract audio from video as 16kHz mono WAV (required by whisper.cpp)."""
	cmd = [
		"ffmpeg",
		"-hide_banner",
		"-y",
		"-i",
		video_path,
		"-vn",
		"-sn",
		"-dn",
		"-ac",
		"1",
		"-ar",
		"16000",
		"-c:a",
		"pcm_s16le",
		output_path,
	]
	result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
	if result.returncode != 0:
		raise RuntimeError(f"ffmpeg failed: {result.stderr}")


def run_whisper(audio_path: str, model_path: str, output_base: str) -> dict:
	"""Run whisper-cli and return parsed JSON output."""
	cmd = [
		WHISPER_BINARY,
		"-m",
		model_path,
		"-f",
		audio_path,
		"-l",
		"en",
		"-ojf",
		"-of",
		output_base,
	]

	result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
	if result.returncode != 0:
		raise RuntimeError(f"whisper-cli failed: {result.stderr}")

	json_path = f"{output_base}.json"
	if os.path.exists(json_path):
		with open(json_path) as f:
			return json.load(f)

	return {}


DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen"


def run_deepgram_transcription(audio_path: str, api_key: str) -> list[dict]:
	"""Call Deepgram API with speaker diarization and return speaker-labeled segments."""
	with open(audio_path, "rb") as audio_file:
		response = requests.post(
			DEEPGRAM_API_URL,
			headers={
				"Authorization": f"Token {api_key}",
				"Content-Type": "audio/wav",
			},
			params={
				"model": "nova-2",
				"diarize": "true",
				"utterances": "true",
				"punctuate": "true",
				"smart_format": "true",
			},
			data=audio_file,
			timeout=1800,
		)

	if response.status_code != 200:
		raise RuntimeError(f"Deepgram API failed ({response.status_code}): {response.text}")

	return parse_deepgram_response(response.json())


def parse_deepgram_response(data: dict) -> list[dict]:
	"""Parse Deepgram response into segments with speaker labels.

	Uses utterances (grouped by speaker turns) for cleaner output.
	Falls back to word-level grouping if utterances unavailable.
	"""
	segments = []

	# Prefer utterances — already grouped by speaker turn
	utterances = data.get("results", {}).get("utterances", [])
	if utterances:
		for utt in utterances:
			text = utt.get("transcript", "").strip()
			if text:
				segments.append(
					{
						"start": float(utt.get("start", 0)),
						"end": float(utt.get("end", 0)),
						"text": text,
						"speaker": utt.get("speaker", 0),
					}
				)
		return segments

	# Fallback: group words by speaker from channels
	channels = data.get("results", {}).get("channels", [])
	if not channels:
		return segments

	words = channels[0].get("alternatives", [{}])[0].get("words", [])
	if not words:
		return segments

	# Group consecutive words by same speaker
	current_speaker = words[0].get("speaker", 0)
	current_start = words[0].get("start", 0)
	current_words = [words[0].get("word", "")]

	for w in words[1:]:
		speaker = w.get("speaker", 0)
		if speaker != current_speaker:
			segments.append(
				{
					"start": float(current_start),
					"end": float(words[len(current_words) - 1].get("end", 0)),
					"text": " ".join(current_words),
					"speaker": current_speaker,
				}
			)
			current_speaker = speaker
			current_start = w.get("start", 0)
			current_words = [w.get("word", "")]
		else:
			current_words.append(w.get("word", ""))

	# Don't forget the last group
	if current_words:
		segments.append(
			{
				"start": float(current_start),
				"end": float(words[-1].get("end", 0)),
				"text": " ".join(current_words),
				"speaker": current_speaker,
			}
		)

	return segments


def segments_to_markdown_with_speakers(segments: list[dict]) -> str:
	"""Convert speaker-labeled segments to markdown with timestamps and speaker labels."""
	if not segments:
		return ""

	lines = []
	for seg in segments:
		ts = format_timestamp(seg["start"])
		speaker = seg.get("speaker", 0)
		lines.append(f"**[{ts}]** **Speaker {speaker + 1}:** {seg['text']}")

	return "\n\n".join(lines)


OPENAI_MAX_FILE_SIZE = 24 * 1024 * 1024  # 24MB (leave margin below 25MB limit)
CHUNK_DURATION_SECS = 1200  # 20 minutes per chunk


def run_openai_whisper(audio_path: str, api_key: str) -> dict:
	"""Call OpenAI Whisper API and return verbose JSON response with segments."""
	with open(audio_path, "rb") as audio_file:
		response = requests.post(
			"https://api.openai.com/v1/audio/transcriptions",
			headers={"Authorization": f"Bearer {api_key}"},
			files={"file": (os.path.basename(audio_path), audio_file, "audio/mpeg")},
			data={
				"model": "whisper-1",
				"response_format": "verbose_json",
				"timestamp_granularities[]": "segment",
			},
			timeout=1800,
		)

	if response.status_code != 200:
		raise RuntimeError(f"OpenAI Whisper API failed ({response.status_code}): {response.text}")

	return response.json()


def _get_audio_duration(audio_path: str) -> float:
	"""Get audio duration in seconds using ffprobe."""
	cmd = [
		"ffprobe",
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"default=noprint_wrappers=1:nokey=1",
		audio_path,
	]
	result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
	if result.returncode != 0:
		raise RuntimeError(f"ffprobe failed: {result.stderr}")
	return float(result.stdout.strip())


def _split_audio_into_chunks(
	mp3_path: str, tmpdir: str, chunk_duration: int = CHUNK_DURATION_SECS
) -> list[tuple[str, int]]:
	"""Split an mp3 file into chunks of chunk_duration seconds each."""
	total_duration = _get_audio_duration(mp3_path)
	chunks = []
	start = 0
	idx = 0

	while start < total_duration:
		chunk_path = os.path.join(tmpdir, f"chunk_{idx:03d}.mp3")
		cmd = [
			"ffmpeg",
			"-hide_banner",
			"-y",
			"-i",
			mp3_path,
			"-ss",
			str(start),
			"-t",
			str(chunk_duration),
			"-c",
			"copy",
			chunk_path,
		]
		result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
		if result.returncode != 0:
			raise RuntimeError(f"ffmpeg chunk split failed: {result.stderr}")
		chunks.append((chunk_path, start))
		start += chunk_duration
		idx += 1

	return chunks


def _transcribe_with_openai(mp3_path: str, api_key: str, tmpdir: str) -> list[dict]:
	"""Transcribe mp3 via OpenAI, chunking if file exceeds size limit. Returns segments."""
	file_size = os.path.getsize(mp3_path)

	if file_size <= OPENAI_MAX_FILE_SIZE:
		whisper_output = run_openai_whisper(mp3_path, api_key)
		return parse_segments(whisper_output)

	# File too large — split into chunks and transcribe each
	frappe.logger().info(f"Audio file {file_size / 1024 / 1024:.1f}MB exceeds limit, splitting into chunks")
	chunks = _split_audio_into_chunks(mp3_path, tmpdir)
	all_segments = []

	for chunk_path, offset_secs in chunks:
		frappe.logger().info(f"Transcribing chunk at offset {offset_secs}s: {chunk_path}")
		whisper_output = run_openai_whisper(chunk_path, api_key)
		chunk_segments = parse_segments(whisper_output)

		# Offset timestamps by the chunk's start time
		for seg in chunk_segments:
			seg["start"] += offset_secs
			seg["end"] += offset_secs
		all_segments.extend(chunk_segments)

	return all_segments


def format_timestamp(seconds: float) -> str:
	"""Format seconds as MM:SS or HH:MM:SS for videos >= 1 hour."""
	hours = int(seconds // 3600)
	minutes = int((seconds % 3600) // 60)
	secs = int(seconds % 60)
	if hours > 0:
		return f"{hours:02d}:{minutes:02d}:{secs:02d}"
	return f"{minutes:02d}:{secs:02d}"


def parse_segments(whisper_output: dict) -> list[dict]:
	"""Parse whisper JSON output into segments with timestamps."""
	segments = []

	# Try transcription[].tokens first (most granular)
	transcription = whisper_output.get("transcription", [])
	if transcription:
		for item in transcription:
			offsets = item.get("offsets", {})
			start_ms = offsets.get("from", 0)
			end_ms = offsets.get("to", 0)
			text = item.get("text", "").strip()
			if text and not text.startswith("[_"):
				segments.append(
					{
						"start": start_ms / 1000,
						"end": end_ms / 1000,
						"text": text,
					}
				)
		if segments:
			return segments

	# Fallback to segments[]
	raw_segments = whisper_output.get("segments", [])
	for seg in raw_segments:
		text = seg.get("text", seg.get("transcript", "")).strip()
		start = seg.get("start", seg.get("t0", 0))
		end = seg.get("end", seg.get("t1", 0))
		if text:
			segments.append({"start": float(start), "end": float(end), "text": text})

	return segments


def segments_to_markdown(segments: list[dict]) -> str:
	"""Convert segments to readable markdown with timestamps."""
	if not segments:
		return ""

	lines = []
	for seg in segments:
		ts = format_timestamp(seg["start"])
		lines.append(f"**[{ts}]** {seg['text']}")

	return "\n\n".join(lines)


@frappe.whitelist()
def start_transcription(asset_name: str):
	"""Enqueue a transcription job for the given asset."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	asset = frappe.get_doc("VMS Asset", asset_name)

	if not asset.r2_key:
		frappe.throw(_("Asset has no uploaded file"))

	if asset.transcription_status == "Processing":
		frappe.throw(_("Transcription is already in progress"))

	settings = frappe.get_single("VMS Settings")
	provider = settings.transcription_provider or "OpenAI Whisper"

	if provider == "OpenAI Whisper":
		if not settings.openai_api_key:
			frappe.throw(_("OpenAI API key is not configured. Go to Settings > Transcription to add it."))
	elif provider == "Deepgram":
		if not settings.deepgram_api_key:
			frappe.throw(_("Deepgram API key is not configured. Go to Settings > Transcription to add it."))
	elif provider == "whisper.cpp":
		if not ensure_whisper_installed():
			frappe.throw(_("whisper-cli is not installed. Install it with: brew install whisper-cpp"))

	# Mark as processing
	asset.transcription_status = "Processing"
	asset.save(ignore_permissions=True)
	frappe.db.commit()

	frappe.enqueue(
		"vms.transcription.process_transcription",
		asset_name=asset_name,
		queue="long",
		enqueue_after_commit=True,
		timeout=3600,
	)

	return {"status": "ok", "transcription_status": "Processing"}


@frappe.whitelist(methods=["GET"])
def get_transcription(asset_name: str):
	"""Get the transcription status and content for an asset."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	data = frappe.db.get_value(
		"VMS Asset",
		asset_name,
		["transcription_status", "transcription", "speaker_names"],
		as_dict=True,
	)

	return {
		"transcription_status": data.transcription_status or "",
		"transcription": data.transcription or "",
		"speaker_names": frappe.parse_json(data.speaker_names) if data.speaker_names else {},
	}


@frappe.whitelist(methods=["POST"])
def save_speaker_names(asset_name: str, speaker_names: dict | str):
	"""Save custom speaker name mappings for an asset's transcription."""
	if not frappe.db.exists("VMS Asset", asset_name):
		frappe.throw(_("Asset {0} does not exist").format(asset_name))

	if isinstance(speaker_names, str):
		speaker_names = frappe.parse_json(speaker_names)

	frappe.db.set_value("VMS Asset", asset_name, "speaker_names", frappe.as_json(speaker_names))
	return {"status": "ok"}


def process_transcription(asset_name: str):
	"""Background job: download video, extract audio, run whisper, save transcript."""
	asset = frappe.get_doc("VMS Asset", asset_name)

	try:
		settings = frappe.get_single("VMS Settings")
		provider = settings.transcription_provider or "OpenAI Whisper"

		# Create temp directory for work
		with tempfile.TemporaryDirectory() as tmpdir:
			# Download video from R2
			video_path = os.path.join(tmpdir, "video" + _get_extension(asset.file_name))
			download_url = generate_presigned_download_url(asset.r2_key, asset.file_name)
			frappe.logger().info(f"Downloading video for transcription: {asset_name}")
			urlretrieve(download_url, video_path)

			# Extract audio
			audio_path = os.path.join(tmpdir, "audio.wav")
			frappe.logger().info(f"Extracting audio: {asset_name}")
			extract_audio(video_path, audio_path)

			if provider == "OpenAI Whisper":
				api_key = settings.get_password("openai_api_key")
				# Compress to mp3 for OpenAI (25MB file limit)
				mp3_path = os.path.join(tmpdir, "audio.mp3")
				frappe.logger().info(f"Compressing audio to mp3: {asset_name}")
				_compress_audio_to_mp3(audio_path, mp3_path)
				frappe.logger().info(f"Running OpenAI Whisper API: {asset_name}")
				segments = _transcribe_with_openai(mp3_path, api_key, tmpdir)
				markdown = segments_to_markdown(segments)
			elif provider == "Deepgram":
				api_key = settings.get_password("deepgram_api_key")
				frappe.logger().info(f"Running Deepgram API with diarization: {asset_name}")
				segments = run_deepgram_transcription(audio_path, api_key)
				markdown = segments_to_markdown_with_speakers(segments)
			else:
				model_name = settings.whisper_model or "ggml-small.en"
				model_path = ensure_model_downloaded(model_name)
				output_base = os.path.join(tmpdir, "transcript")
				frappe.logger().info(f"Running whisper-cli: {asset_name}")
				whisper_output = run_whisper(audio_path, str(model_path), output_base)
				segments = parse_segments(whisper_output)
				markdown = segments_to_markdown(segments)

			# Format is already computed above per provider

			if not markdown and provider == "whisper.cpp":
				# Fallback: try to read the .txt output
				txt_path = f"{output_base}.txt"
				if os.path.exists(txt_path):
					with open(txt_path) as f:
						markdown = f.read().strip()

		# Save to asset
		asset.reload()
		asset.transcription = markdown
		asset.transcription_status = "Complete"
		asset.save(ignore_permissions=True)
		frappe.db.commit()

		frappe.logger().info(f"Transcription complete: {asset_name}")

	except Exception as e:
		frappe.logger().error(f"Transcription failed for {asset_name}: {e}")
		asset.reload()
		asset.transcription_status = "Error"
		asset.transcription = f"Transcription failed: {e}"
		asset.save(ignore_permissions=True)
		frappe.db.commit()


def _compress_audio_to_mp3(wav_path: str, mp3_path: str) -> None:
	"""Compress WAV to mp3 to stay within OpenAI's 25MB limit."""
	cmd = [
		"ffmpeg",
		"-hide_banner",
		"-y",
		"-i",
		wav_path,
		"-ac",
		"1",
		"-ar",
		"16000",
		"-b:a",
		"64k",
		mp3_path,
	]
	result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
	if result.returncode != 0:
		raise RuntimeError(f"ffmpeg mp3 compression failed: {result.stderr}")


def _get_extension(filename: str) -> str:
	"""Get file extension from filename."""
	if "." in filename:
		return "." + filename.rsplit(".", 1)[1].lower()
	return ".mp4"
