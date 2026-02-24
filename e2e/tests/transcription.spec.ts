import { test, expect } from "@playwright/test";
import {
	createTestProject,
	createTestAsset,
	uploadTestFile,
	startTranscription,
	getTranscription,
	saveSpeakerNames,
	cleanupTestProjects,
} from "../helpers/vms";
import { callMethod, updateDoc } from "../helpers/frappe";

test.describe("Transcription – API", () => {
	let projectName: string;
	const createdAssets: string[] = [];

	test.beforeAll(async ({ request }) => {
		const project = await createTestProject(request, {
			project_name: "E2E Test Project Transcription",
		});
		projectName = project.name;
	});

	test.afterAll(async ({ request }) => {
		// Reset any assets stuck in Processing back to Ready for clean deletion
		for (const assetName of createdAssets) {
			try {
				await updateDoc(request, "VMS Asset", assetName, {
					transcription_status: "",
					transcription: "",
					speaker_names: "",
				});
			} catch {
				// Asset may be gone
			}
		}
		await cleanupTestProjects(request, "E2E Test Project Transcription");
	});

	// ── get_transcription (GET) ─────────────────────────────────────────────

	test("get_transcription should return empty status for new asset", async ({
		request,
	}) => {
		const asset = await createTestAsset(request, { project: projectName });
		createdAssets.push(asset.name);

		const result = await getTranscription(request, asset.name);

		expect(result.transcription_status).toBe("");
		expect(result.transcription).toBe("");
		expect(result.speaker_names).toEqual({});
	});

	test("get_transcription should reject non-existent asset", async ({
		request,
	}) => {
		await expect(
			getTranscription(request, "VMS-AST-NONEXISTENT-999"),
		).rejects.toThrow();
	});

	test("get_transcription should return Complete status and transcript content", async ({
		request,
	}) => {
		const asset = await createTestAsset(request, { project: projectName });
		createdAssets.push(asset.name);

		// Set transcription data directly (simulates completed transcription)
		await updateDoc(request, "VMS Asset", asset.name, {
			transcription_status: "Complete",
			transcription:
				"**[00:00]** Hello, this is a test transcription.\n\n**[00:05]** Second segment here.",
		});

		const result = await getTranscription(request, asset.name);

		expect(result.transcription_status).toBe("Complete");
		expect(result.transcription).toContain("Hello, this is a test");
		expect(result.transcription).toContain("**[00:00]**");
		expect(result.transcription).toContain("**[00:05]**");
	});

	test("get_transcription should return Error status with error message", async ({
		request,
	}) => {
		const asset = await createTestAsset(request, { project: projectName });
		createdAssets.push(asset.name);

		await updateDoc(request, "VMS Asset", asset.name, {
			transcription_status: "Error",
			transcription: "Transcription failed: ffmpeg not found",
		});

		const result = await getTranscription(request, asset.name);

		expect(result.transcription_status).toBe("Error");
		expect(result.transcription).toContain("Transcription failed");
	});

	// ── start_transcription (POST) ──────────────────────────────────────────

	test("start_transcription should reject non-existent asset", async ({
		request,
	}) => {
		await expect(
			callMethod(request, "vms.transcription.start_transcription", {
				asset_name: "VMS-AST-NONEXISTENT-999",
			}),
		).rejects.toThrow();
	});

	test("start_transcription should reject asset without r2_key", async ({
		request,
	}) => {
		const asset = await createTestAsset(request, { project: projectName });
		createdAssets.push(asset.name);

		await expect(
			callMethod(request, "vms.transcription.start_transcription", {
				asset_name: asset.name,
			}),
		).rejects.toThrow(/no uploaded file/i);
	});

	test("start_transcription should set status to Processing", async ({
		request,
	}) => {
		// Upload a test file so the asset has an r2_key
		const { asset_name } = await uploadTestFile(request, {
			project: projectName,
			file_name: `transcription-test-${Date.now()}.mp4`,
		});
		createdAssets.push(asset_name);

		const result = await startTranscription(request, asset_name);

		expect(result.status).toBe("ok");
		expect(result.transcription_status).toBe("Processing");

		// Verify asset status was updated
		const transcription = await getTranscription(request, asset_name);
		expect(transcription.transcription_status).toBe("Processing");
	});

	test("start_transcription should reject already-processing asset", async ({
		request,
	}) => {
		const asset = await createTestAsset(request, { project: projectName });
		createdAssets.push(asset.name);

		// Manually set to Processing with a fake r2_key
		await updateDoc(request, "VMS Asset", asset.name, {
			r2_key: "test/fake-key.mp4",
			transcription_status: "Processing",
		});

		await expect(
			callMethod(request, "vms.transcription.start_transcription", {
				asset_name: asset.name,
			}),
		).rejects.toThrow(/already in progress/i);
	});

	// ── save_speaker_names (POST) ───────────────────────────────────────────

	test("save_speaker_names should persist speaker names", async ({
		request,
	}) => {
		const asset = await createTestAsset(request, { project: projectName });
		createdAssets.push(asset.name);

		const names = { "1": "Alice", "2": "Bob" };
		const result = await saveSpeakerNames(request, asset.name, names);

		expect(result.status).toBe("ok");

		// Verify persisted via get_transcription
		const transcription = await getTranscription(request, asset.name);
		expect(transcription.speaker_names).toEqual(names);
	});

	test("save_speaker_names should overwrite previous names", async ({
		request,
	}) => {
		const asset = await createTestAsset(request, { project: projectName });
		createdAssets.push(asset.name);

		// Save initial names
		await saveSpeakerNames(request, asset.name, { "1": "Alice" });

		// Overwrite with new names
		const newNames = { "1": "Charlie", "2": "Dave" };
		await saveSpeakerNames(request, asset.name, newNames);

		const transcription = await getTranscription(request, asset.name);
		expect(transcription.speaker_names).toEqual(newNames);
	});

	test("save_speaker_names should reject non-existent asset", async ({
		request,
	}) => {
		await expect(
			callMethod(request, "vms.transcription.save_speaker_names", {
				asset_name: "VMS-AST-NONEXISTENT-999",
				speaker_names: JSON.stringify({ "1": "Test" }),
			}),
		).rejects.toThrow();
	});
});

test.describe("Transcription – UI", () => {
	let projectName: string;
	let assetWithTranscript: string;
	let assetWithSpeakers: string;
	let assetNoTranscript: string;
	const createdAssets: string[] = [];

	test.beforeAll(async ({ request }) => {
		const project = await createTestProject(request, {
			project_name: "E2E Test Project Transcription UI",
		});
		projectName = project.name;

		// Asset with no transcription
		const noTranscript = await createTestAsset(request, {
			project: projectName,
			file_name: "no-transcript.mp4",
		});
		assetNoTranscript = noTranscript.name;
		createdAssets.push(assetNoTranscript);

		// Asset with completed transcription
		const withTranscript = await createTestAsset(request, {
			project: projectName,
			file_name: "with-transcript.mp4",
		});
		assetWithTranscript = withTranscript.name;
		createdAssets.push(assetWithTranscript);
		await updateDoc(request, "VMS Asset", assetWithTranscript, {
			transcription_status: "Complete",
			transcription:
				"**[00:00]** Welcome to our test video.\n\n**[00:10]** This is the second segment with more content.",
		});

		// Asset with speaker-labeled transcription
		const withSpeakers = await createTestAsset(request, {
			project: projectName,
			file_name: "with-speakers.mp4",
		});
		assetWithSpeakers = withSpeakers.name;
		createdAssets.push(assetWithSpeakers);
		await updateDoc(request, "VMS Asset", assetWithSpeakers, {
			transcription_status: "Complete",
			transcription:
				"**[00:00]** **Speaker 1:** Hello everyone, welcome to the meeting.\n\n**[00:05]** **Speaker 2:** Thanks for having me.",
			speaker_names: JSON.stringify({ "1": "Alice", "2": "Bob" }),
		});
	});

	test.afterAll(async ({ request }) => {
		for (const assetName of createdAssets) {
			try {
				await updateDoc(request, "VMS Asset", assetName, {
					transcription_status: "",
					transcription: "",
					speaker_names: "",
				});
			} catch {
				// Asset may be gone
			}
		}
		await cleanupTestProjects(request, "E2E Test Project Transcription UI");
	});

	test("review page should show Transcribe button for untranscribed asset", async ({
		page,
	}) => {
		await page.goto(`/vms/review/${assetNoTranscript}`);
		await page.waitForLoadState("networkidle");

		// Look for the Transcribe button in the header
		const transcribeBtn = page.getByRole("button", { name: /transcribe/i });
		await expect(transcribeBtn).toBeVisible();
	});

	test("review page should show Transcript button for transcribed asset", async ({
		page,
	}) => {
		await page.goto(`/vms/review/${assetWithTranscript}`);
		await page.waitForLoadState("networkidle");

		// When transcription is complete, button text changes to "Transcript"
		const transcriptBtn = page.getByRole("button", { name: /transcript/i });
		await expect(transcriptBtn).toBeVisible();
	});

	test("transcription sheet should open and show CTA for untranscribed asset", async ({
		page,
	}) => {
		await page.goto(`/vms/review/${assetNoTranscript}`);
		await page.waitForLoadState("networkidle");

		// Click to open transcription sheet
		const transcribeBtn = page.getByRole("button", { name: /transcribe/i });
		await transcribeBtn.click();

		// Sheet should show the CTA
		await expect(
			page.locator("text=No transcription yet"),
		).toBeVisible();

		// Should have a Transcribe button inside the sheet
		const sheetTranscribeBtn = page
			.locator("[role='dialog']")
			.getByRole("button", { name: /transcribe/i });
		await expect(sheetTranscribeBtn).toBeVisible();
	});

	test("transcription sheet should show transcript text when complete", async ({
		page,
	}) => {
		await page.goto(`/vms/review/${assetWithTranscript}`);
		await page.waitForLoadState("networkidle");

		// Click to open transcription sheet
		const transcriptBtn = page.getByRole("button", { name: /transcript/i });
		await transcriptBtn.click();

		// Should show the transcript content
		await expect(
			page.locator("text=Welcome to our test video"),
		).toBeVisible();
		await expect(
			page.locator("text=second segment"),
		).toBeVisible();

		// Should show search button
		await expect(
			page.locator("[title='Search transcription']"),
		).toBeVisible();
	});

	test("transcription sheet should show speaker chips for diarized transcript", async ({
		page,
	}) => {
		await page.goto(`/vms/review/${assetWithSpeakers}`);
		await page.waitForLoadState("networkidle");

		// Click to open transcription sheet
		const transcriptBtn = page.getByRole("button", { name: /transcript/i });
		await transcriptBtn.click();

		// Should show the Speakers bar
		await expect(page.locator("text=Speakers:")).toBeVisible();

		// Should show renamed speaker chips (Alice and Bob)
		await expect(page.getByText("Alice", { exact: true })).toBeVisible();
		await expect(page.getByText("Bob", { exact: true })).toBeVisible();

		// Should show transcript content with speaker labels
		await expect(
			page.locator("text=Hello everyone, welcome to the meeting"),
		).toBeVisible();
	});
});
