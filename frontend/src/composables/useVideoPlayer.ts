import { readonly, ref, watch, type Ref } from 'vue'
import { formatDuration } from '@/lib/format'

export function useVideoPlayer(video: Ref<HTMLVideoElement | null>) {
	const isPlaying = ref(false)
	const currentTime = ref(0)
	const duration = ref(0)
	const volume = ref(1)
	const isMuted = ref(false)
	const playbackRate = ref(1)
	const isLooping = ref(false)
	const isReady = ref(false)
	const isBuffering = ref(false)
	let animationFrame = 0

	function syncTime() {
		const element = video.value
		if (!element || element.paused) return
		currentTime.value = element.currentTime
		animationFrame = requestAnimationFrame(syncTime)
	}

	watch(
		video,
		(element, _previous, onCleanup) => {
			if (!element) return

			const onMetadata = () => {
				duration.value = Number.isFinite(element.duration) ? element.duration : 0
				isReady.value = true
			}
			const onPlay = () => {
				isPlaying.value = true
				cancelAnimationFrame(animationFrame)
				animationFrame = requestAnimationFrame(syncTime)
			}
			const onPause = () => {
				isPlaying.value = false
				currentTime.value = element.currentTime
				cancelAnimationFrame(animationFrame)
			}
			const onSeeked = () => {
				currentTime.value = element.currentTime
			}
			const onVolume = () => {
				volume.value = element.volume
				isMuted.value = element.muted
			}
			const onRate = () => {
				playbackRate.value = element.playbackRate
			}
			const onWaiting = () => {
				isBuffering.value = true
			}
			const onCanPlay = () => {
				isBuffering.value = false
			}

			element.addEventListener('loadedmetadata', onMetadata)
			element.addEventListener('loadeddata', onMetadata)
			element.addEventListener('durationchange', onMetadata)
			element.addEventListener('play', onPlay)
			element.addEventListener('pause', onPause)
			element.addEventListener('ended', onPause)
			element.addEventListener('seeked', onSeeked)
			element.addEventListener('volumechange', onVolume)
			element.addEventListener('ratechange', onRate)
			element.addEventListener('waiting', onWaiting)
			element.addEventListener('playing', onCanPlay)
			element.addEventListener('canplay', onCanPlay)

			if (element.readyState >= HTMLMediaElement.HAVE_METADATA) onMetadata()

			onCleanup(() => {
				element.removeEventListener('loadedmetadata', onMetadata)
				element.removeEventListener('loadeddata', onMetadata)
				element.removeEventListener('durationchange', onMetadata)
				element.removeEventListener('play', onPlay)
				element.removeEventListener('pause', onPause)
				element.removeEventListener('ended', onPause)
				element.removeEventListener('seeked', onSeeked)
				element.removeEventListener('volumechange', onVolume)
				element.removeEventListener('ratechange', onRate)
				element.removeEventListener('waiting', onWaiting)
				element.removeEventListener('playing', onCanPlay)
				element.removeEventListener('canplay', onCanPlay)
				cancelAnimationFrame(animationFrame)
			})
		},
		{ immediate: true },
	)

	function togglePlay() {
		const element = video.value
		if (!element) return
		if (element.paused) void element.play()
		else element.pause()
	}

	function seek(time: number) {
		const element = video.value
		if (!element) return
		const upperBound = Number.isFinite(element.duration) ? element.duration : 0
		element.currentTime = Math.max(0, Math.min(time, upperBound))
		currentTime.value = element.currentTime
	}

	function setVolume(nextVolume: number) {
		const element = video.value
		if (!element) return
		element.volume = Math.max(0, Math.min(1, nextVolume))
		if (nextVolume > 0 && element.muted) element.muted = false
	}

	function toggleMute() {
		if (video.value) video.value.muted = !video.value.muted
	}

	function setPlaybackRate(rate: number) {
		if (video.value) video.value.playbackRate = rate
	}

	function toggleLoop() {
		const element = video.value
		if (!element) return
		element.loop = !element.loop
		isLooping.value = element.loop
	}

	return {
		isPlaying: readonly(isPlaying),
		currentTime: readonly(currentTime),
		duration: readonly(duration),
		volume: readonly(volume),
		isMuted: readonly(isMuted),
		playbackRate: readonly(playbackRate),
		isLooping: readonly(isLooping),
		isReady: readonly(isReady),
		isBuffering: readonly(isBuffering),
		togglePlay,
		seek,
		setVolume,
		toggleMute,
		setPlaybackRate,
		toggleLoop,
	}
}

export function formatTimecode(seconds: number, fps = 30): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00:00'
	const totalFrames = Math.floor(seconds * fps)
	const totalSeconds = Math.floor(seconds)
	return [
		Math.floor(totalSeconds / 3600),
		Math.floor(totalSeconds / 60) % 60,
		totalSeconds % 60,
		totalFrames % fps,
	]
		.map((part) => String(part).padStart(2, '0'))
		.join(':')
}

export function formatTimestamp(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
	return formatDuration(seconds)
}
