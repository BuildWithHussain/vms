import { test, expect } from "@playwright/test";
import {
	createTestProject,
	cleanupTestProjects,
	uploadTestFile,
	enableProjectSharing,
	disableProjectSharing,
	ShareResult,
} from "../helpers/vms";
import { guestGet, guestPost } from "../helpers/frappe";

test.describe("Project Sharing", () => {
	let projectName: string;
	let assetName: string;

	test.beforeAll(async ({ request }) => {
		const project = await createTestProject(request, {
			project_name: `E2E Sharing Project ${Date.now()}`,
		});
		projectName = project.name;

		const { asset_name } = await uploadTestFile(request, {
			file_name: "shared-test.mp4",
			content: Buffer.from("shared test content"),
			content_type: "video/mp4",
			project: projectName,
		});
		assetName = asset_name;
	});

	test.afterAll(async ({ request }) => {
		await cleanupTestProjects(request, "E2E Sharing Project");
	});

	// ── Authenticated API tests ─────────────────────────────────────────────

	test("should enable project sharing and return token + URL", async ({
		request,
	}) => {
		const result = await enableProjectSharing(request, projectName);

		expect(result.share_token).toBeTruthy();
		expect(result.share_url).toContain(`/vms/shared/${projectName}`);
		expect(result.share_url).toContain(`token=${result.share_token}`);
	});

	test("should return same token when sharing already enabled", async ({
		request,
	}) => {
		const first = await enableProjectSharing(request, projectName);
		const second = await enableProjectSharing(request, projectName);

		expect(first.share_token).toBe(second.share_token);
	});

	test("should disable project sharing", async ({ request }) => {
		// Ensure sharing is on first
		await enableProjectSharing(request, projectName);

		await disableProjectSharing(request, projectName);

		// Re-enable so subsequent tests work — token should be new
		const fresh = await enableProjectSharing(request, projectName);
		expect(fresh.share_token).toBeTruthy();
	});

	// ── Guest API tests ─────────────────────────────────────────────────────

	test("guest should fetch shared project info with valid token", async ({
		request,
	}) => {
		const { share_token } = await enableProjectSharing(
			request,
			projectName,
		);

		const { status, data } = await guestGet<{
			name: string;
			project_name: string;
			status: string;
		}>(request, "vms.api.get_shared_project", {
			project: projectName,
			token: share_token,
		});

		expect(status).toBe(200);
		expect(data).toBeTruthy();
		expect(data!.name).toBe(projectName);
		expect(data!.status).toBeTruthy();
	});

	test("guest should fetch shared project assets with valid token", async ({
		request,
	}) => {
		const { share_token } = await enableProjectSharing(
			request,
			projectName,
		);

		const { status, data } = await guestGet<{
			assets: Array<{ name: string; file_name: string }>;
			total: number;
			page: number;
			total_pages: number;
		}>(request, "vms.api.get_shared_project_assets", {
			project: projectName,
			token: share_token,
			page: 1,
			page_size: 20,
		});

		expect(status).toBe(200);
		expect(data).toBeTruthy();
		expect(data!.total).toBeGreaterThanOrEqual(1);
		expect(data!.assets.length).toBeGreaterThanOrEqual(1);

		// Our uploaded asset should be in the list
		const found = data!.assets.find((a) => a.name === assetName);
		expect(found).toBeTruthy();
		expect(found!.file_name).toBe("shared-test.mp4");
	});

	test("guest should get download URL for shared asset", async ({
		request,
	}) => {
		const { share_token } = await enableProjectSharing(
			request,
			projectName,
		);

		const { status, data } = await guestPost<{ url: string }>(
			request,
			"vms.api.get_shared_asset_download_url",
			{
				asset_name: assetName,
				project: projectName,
				token: share_token,
			},
		);

		expect(status).toBe(200);
		expect(data).toBeTruthy();
		expect(data!.url).toContain("X-Amz-Signature");
	});

	test("guest should be rejected with invalid token", async ({
		request,
	}) => {
		const { status } = await guestGet(
			request,
			"vms.api.get_shared_project",
			{
				project: projectName,
				token: "invalid-token-12345",
			},
		);

		// Frappe returns 403 for AuthenticationError
		expect(status).toBeGreaterThanOrEqual(400);
	});

	test("guest should be rejected without token", async ({ request }) => {
		const { status } = await guestGet(
			request,
			"vms.api.get_shared_project",
			{
				project: projectName,
			},
		);

		expect(status).toBeGreaterThanOrEqual(400);
	});

	test("guest should be rejected after sharing is disabled", async ({
		request,
	}) => {
		// Enable then disable sharing
		await enableProjectSharing(request, projectName);
		const { share_token } = await enableProjectSharing(
			request,
			projectName,
		);
		await disableProjectSharing(request, projectName);

		const { status } = await guestGet(
			request,
			"vms.api.get_shared_project_assets",
			{
				project: projectName,
				token: share_token,
			},
		);

		expect(status).toBeGreaterThanOrEqual(400);

		// Re-enable for UI tests below
		await enableProjectSharing(request, projectName);
	});

	// ── UI tests ────────────────────────────────────────────────────────────

	test("shared page should display project and assets with valid token", async ({
		page,
		request,
	}) => {
		const { share_token } = await enableProjectSharing(
			request,
			projectName,
		);

		await page.goto(`/vms/shared/${projectName}?token=${share_token}`);
		await page.waitForLoadState("networkidle");

		// Project name visible
		await expect(page.locator("h1").first()).toBeVisible();

		// File count text (e.g. "1 file shared" or "2 files shared")
		await expect(
			page.locator("text=/\\d+ files? shared/").first(),
		).toBeVisible();

		// Asset card with file name
		await expect(
			page.locator("text=shared-test.mp4").first(),
		).toBeVisible({ timeout: 10000 });
	});

	test("shared page should show error without token", async ({ page }) => {
		await page.goto(`/vms/shared/${projectName}`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.locator("text=Invalid share link").first(),
		).toBeVisible();
	});

	test("shared page should show error with invalid token", async ({
		browser,
	}) => {
		// Use a fresh context without auth cookies (guest browser).
		// Explicitly clear storageState so no auth cookies are inherited.
		const guestContext = await browser.newContext({
			storageState: { cookies: [], origins: [] },
			baseURL: "http://vms.localhost:8000",
		});
		const guestPage = await guestContext.newPage();

		await guestPage.goto(
			`/vms/shared/${projectName}?token=bad-token-xyz`,
		);
		await guestPage.waitForLoadState("networkidle");

		await expect(
			guestPage.locator("text=/expired|invalid/i").first(),
		).toBeVisible({ timeout: 10000 });

		await guestContext.close();
	});
});
