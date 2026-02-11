import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import {
	createTestProject,
	cleanupTestProjects,
	uploadTestFile,
	deleteAsset,
	VMSProject,
} from "../helpers/vms";
import { callMethod, getDoc } from "../helpers/frappe";

const TEST_VIDEO_PATH = path.join(__dirname, "..", "fixtures", "test-video.mp4");

/**
 * Check if R2 is configured by calling test_r2_connection.
 * Returns true if R2 is available, false otherwise.
 */
async function isR2Configured(request: import("@playwright/test").APIRequestContext): Promise<boolean> {
	try {
		await callMethod(request, "vms.api.test_r2_connection");
		return true;
	} catch {
		return false;
	}
}

test.describe("Thumbnail Generation", () => {
	let testProject: VMSProject;
	let r2Available = false;
	let assetName: string | undefined;

	test.beforeAll(async ({ request }) => {
		// Check if R2 is configured
		r2Available = await isR2Configured(request);
		if (!r2Available) {
			console.warn("R2 is not configured — skipping thumbnail tests");
			return;
		}

		// Generate a small test video with ffmpeg (2 seconds, solid color)
		const fixturesDir = path.dirname(TEST_VIDEO_PATH);
		if (!fs.existsSync(fixturesDir)) {
			fs.mkdirSync(fixturesDir, { recursive: true });
		}

		if (!fs.existsSync(TEST_VIDEO_PATH)) {
			try {
				execSync(
					`ffmpeg -y -f lavfi -i color=c=blue:s=320x240:d=2 -c:v libx264 -pix_fmt yuv420p "${TEST_VIDEO_PATH}"`,
					{ timeout: 30000, stdio: "pipe" },
				);
			} catch (e) {
				console.error("Failed to generate test video with ffmpeg:", e);
				r2Available = false;
				return;
			}
		}

		// Create a test project
		testProject = await createTestProject(request, {
			project_name: `E2E Thumbnail Test ${Date.now()}`,
		});

		// Upload the test video via the API
		const videoContent = fs.readFileSync(TEST_VIDEO_PATH);
		const result = await uploadTestFile(request, {
			file_name: "test-video.mp4",
			content: Buffer.from(videoContent),
			content_type: "video/mp4",
			project: testProject.name,
		});
		assetName = result.asset_name;
	});

	test.afterAll(async ({ request }) => {
		if (assetName) {
			try {
				await deleteAsset(request, assetName);
			} catch {
				// Asset may already be cleaned up
			}
		}
		await cleanupTestProjects(request, "E2E Thumbnail Test");

		// Clean up generated fixture
		if (fs.existsSync(TEST_VIDEO_PATH)) {
			fs.unlinkSync(TEST_VIDEO_PATH);
		}
	});

	test("should generate and display thumbnail after video upload", async ({ page, request }) => {
		test.skip(!r2Available, "R2 is not configured");
		test.skip(!assetName, "Asset upload failed in beforeAll");
		test.slow(); // thumbnail generation is a background job

		// Poll for thumbnail_url to be set (background job, max ~30 seconds)
		let thumbnailUrl: string | null = null;
		for (let attempt = 0; attempt < 15; attempt++) {
			const doc = await getDoc<{ thumbnail_url?: string }>(request, "VMS Asset", assetName!);
			if (doc.thumbnail_url) {
				thumbnailUrl = doc.thumbnail_url;
				break;
			}
			await new Promise((r) => setTimeout(r, 2000));
		}

		expect(thumbnailUrl).toBeTruthy();

		// Navigate to the project page and verify the thumbnail is visible in the UI
		await page.goto(`/vms/projects/${testProject.name}`);
		await page.waitForLoadState("networkidle");

		// The thumbnail should render as an <img> tag inside the asset card
		const thumbnailImg = page.locator(`img[src="${thumbnailUrl}"]`);
		await expect(thumbnailImg.first()).toBeVisible({ timeout: 10000 });
	});
});
