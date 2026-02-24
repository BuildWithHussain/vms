import { test, expect } from "@playwright/test";
import {
	getToolUploadUrl,
	startCompression,
	getCompressStatus,
	getCompressJobs,
	cleanupCompressJobs,
	uploadToPresignedUrl,
} from "../helpers/vms";
import { callMethod, deleteDoc } from "../helpers/frappe";

test.describe("Tools – Compression", () => {
	// Track job names for cleanup
	const createdJobs: string[] = [];

	test.afterAll(async ({ request }) => {
		for (const jobName of createdJobs) {
			try {
				await deleteDoc(request, "VMS Compress Job", jobName);
			} catch {
				// Job may already be gone
			}
		}
	});

	// ── Upload URL API ──────────────────────────────────────────────────────

	test("should get a presigned tool upload URL", async ({ request }) => {
		const result = await getToolUploadUrl(request, {
			file_name: "test-compress.mp4",
			content_type: "video/mp4",
		});

		expect(result.upload_url).toBeTruthy();
		expect(result.r2_key).toBeTruthy();
		expect(result.r2_key).toMatch(/^tools\//);
		expect(result.r2_key).toContain(".mp4");
	});

	test("tool upload URL r2_key should use correct extension", async ({
		request,
	}) => {
		const result = await getToolUploadUrl(request, {
			file_name: "video.mov",
			content_type: "video/quicktime",
		});

		expect(result.r2_key).toMatch(/\.mov$/);
	});

	// ── Start Compression API ───────────────────────────────────────────────

	test("should start a compression job", async ({ request }) => {
		// First upload a dummy file to R2
		const { upload_url, r2_key } = await getToolUploadUrl(request, {
			file_name: "compress-test.mp4",
			content_type: "video/mp4",
		});
		await uploadToPresignedUrl(
			request,
			upload_url,
			Buffer.from("dummy video data"),
			"video/mp4",
		);

		// Start compression
		const result = await startCompression(request, {
			r2_key,
			file_name: "compress-test.mp4",
			file_size: 16,
		});

		expect(result.job_name).toBeTruthy();
		expect(result.status).toBe("Queued");
		createdJobs.push(result.job_name);
	});

	test("should reject compression without r2_key", async ({ request }) => {
		await expect(
			callMethod(request, "vms.tools_api.start_compression", {
				r2_key: "",
				file_name: "test.mp4",
			}),
		).rejects.toThrow();
	});

	test("should reject compression without file_name", async ({
		request,
	}) => {
		await expect(
			callMethod(request, "vms.tools_api.start_compression", {
				r2_key: "tools/some-key.mp4",
				file_name: "",
			}),
		).rejects.toThrow();
	});

	// ── Get Compress Status API (GET) ───────────────────────────────────────

	test("should get compression job status", async ({ request }) => {
		// Create a job to query
		const { upload_url, r2_key } = await getToolUploadUrl(request, {
			file_name: "status-test.mp4",
			content_type: "video/mp4",
		});
		await uploadToPresignedUrl(
			request,
			upload_url,
			Buffer.from("status test data"),
			"video/mp4",
		);
		const { job_name } = await startCompression(request, {
			r2_key,
			file_name: "status-test.mp4",
			file_size: 16,
		});
		createdJobs.push(job_name);

		// Query its status
		const status = await getCompressStatus(request, job_name);

		expect(status.job_name).toBe(job_name);
		expect(status.original_file_name).toBe("status-test.mp4");
		expect(status.original_size).toBe(16);
		expect(["Queued", "Processing", "Uploading", "Complete", "Error"]).toContain(
			status.status,
		);
		expect(typeof status.progress).toBe("number");
	});

	test("should reject status request for non-existent job", async ({
		request,
	}) => {
		await expect(
			getCompressStatus(request, "VMS-CMP-99999"),
		).rejects.toThrow();
	});

	// ── Get Compress Jobs API (GET) ─────────────────────────────────────────

	test("should list compression jobs for current user", async ({
		request,
	}) => {
		const result = await getCompressJobs(request);

		expect(result).toHaveProperty("jobs");
		expect(result).toHaveProperty("total");
		expect(result).toHaveProperty("page");
		expect(result).toHaveProperty("page_size");
		expect(result).toHaveProperty("total_pages");
		expect(Array.isArray(result.jobs)).toBe(true);
		expect(result.total).toBeGreaterThanOrEqual(0);
	});

	test("should respect pagination parameters", async ({ request }) => {
		const result = await getCompressJobs(request, {
			page: 1,
			page_size: 2,
		});

		expect(result.page).toBe(1);
		expect(result.page_size).toBe(2);
		expect(result.jobs.length).toBeLessThanOrEqual(2);
	});

	test("jobs list should include recently created job", async ({
		request,
	}) => {
		// Create a job
		const { upload_url, r2_key } = await getToolUploadUrl(request, {
			file_name: "list-test.mp4",
			content_type: "video/mp4",
		});
		await uploadToPresignedUrl(
			request,
			upload_url,
			Buffer.from("list test data"),
			"video/mp4",
		);
		const { job_name } = await startCompression(request, {
			r2_key,
			file_name: "list-test.mp4",
			file_size: 14,
		});
		createdJobs.push(job_name);

		// Verify it appears in the list
		const result = await getCompressJobs(request, { page_size: 50 });
		const found = result.jobs.find((j) => j.name === job_name);

		expect(found).toBeTruthy();
		expect(found!.original_file_name).toBe("list-test.mp4");
	});

	// ── UI tests ────────────────────────────────────────────────────────────

	test("Tools page should render with Compress tab", async ({ page }) => {
		await page.goto("/vms/tools");
		await page.waitForLoadState("networkidle");

		// Page heading
		await expect(page.locator("h1", { hasText: "Tools" })).toBeVisible();

		// Compress tab is active
		await expect(
			page.locator("[role='tablist'] button", { hasText: "Compress" }),
		).toBeVisible();
	});

	test("Tools page should show file drop zone", async ({ page }) => {
		await page.goto("/vms/tools");
		await page.waitForLoadState("networkidle");

		// Drop zone text
		await expect(
			page.locator("text=Drop a video file here or click to browse"),
		).toBeVisible();

		// Supported formats hint
		await expect(
			page.locator("text=Supports MP4, MOV, MKV, AVI, WebM"),
		).toBeVisible();

		// Compress button (disabled when no file selected)
		const compressBtn = page.getByRole("button", { name: "Compress", exact: true });
		await expect(compressBtn).toBeVisible();
		await expect(compressBtn).toBeDisabled();
	});

	test("Tools page should show job history section", async ({ page }) => {
		await page.goto("/vms/tools");
		await page.waitForLoadState("networkidle");

		// "Recent Jobs" heading
		await expect(
			page.locator("text=Recent Jobs"),
		).toBeVisible();
	});
});
