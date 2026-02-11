import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import {
	createTestProject,
	cleanupTestProjects,
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
	});

	test.afterAll(async ({ request }) => {
		await cleanupTestProjects(request, "E2E Thumbnail Test");

		// Clean up generated fixture
		if (fs.existsSync(TEST_VIDEO_PATH)) {
			fs.unlinkSync(TEST_VIDEO_PATH);
		}
	});

	test("should generate and display thumbnail after video upload", async ({ page, request }) => {
		test.skip(!r2Available, "R2 is not configured");
		test.slow(); // thumbnail generation is a background job

		// Navigate to the project detail page
		await page.goto(`/vms/projects/${testProject.name}`);
		await page.waitForLoadState("networkidle");

		// Click the Upload button to open the upload dialog
		const uploadBtn = page.locator('button:has-text("Upload")');
		await expect(uploadBtn.first()).toBeVisible({ timeout: 10000 });
		await uploadBtn.first().click();

		// Wait for the upload dialog to appear
		const dialog = page.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// Set the file input (hidden input inside the dialog)
		const fileInput = dialog.locator('input[type="file"]');
		await fileInput.setInputFiles(TEST_VIDEO_PATH);

		// Wait for upload to complete — look for the green check mark or "Done" button
		const doneBtn = dialog.locator('button:has-text("Done")');
		await expect(doneBtn).toBeVisible({ timeout: 60000 });

		// Close the upload dialog
		await doneBtn.click();
		await expect(dialog).not.toBeVisible({ timeout: 5000 });

		// Wait for the page to refresh with the new asset
		await page.waitForLoadState("networkidle");

		// Now we need to wait for the background thumbnail job to complete.
		// Poll the asset doc until thumbnail_url is set (max ~30 seconds).
		const fileName = "test-video.mp4";

		// Find the asset name from the API
		const assets = await request.get(
			`/api/resource/VMS Asset?filters=${encodeURIComponent(JSON.stringify({ project: testProject.name, file_name: fileName }))}&fields=["name","thumbnail_url"]&limit_page_length=1`,
		);
		expect(assets.ok()).toBeTruthy();
		const assetData = await assets.json();
		expect(assetData.data.length).toBeGreaterThan(0);
		const assetName = assetData.data[0].name;

		// Poll for thumbnail_url to be set (background job)
		let thumbnailUrl: string | null = null;
		for (let attempt = 0; attempt < 15; attempt++) {
			const doc = await getDoc<{ thumbnail_url?: string }>(request, "VMS Asset", assetName);
			if (doc.thumbnail_url) {
				thumbnailUrl = doc.thumbnail_url;
				break;
			}
			await new Promise((r) => setTimeout(r, 2000));
		}

		expect(thumbnailUrl).toBeTruthy();

		// Reload the page and verify the thumbnail image is visible in the UI
		await page.reload();
		await page.waitForLoadState("networkidle");

		// The thumbnail should render as an <img> tag inside the asset card
		const thumbnailImg = page.locator(`img[src="${thumbnailUrl}"]`);
		await expect(thumbnailImg.first()).toBeVisible({ timeout: 10000 });
	});
});
