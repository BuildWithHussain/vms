import { test, expect } from "@playwright/test";
import {
	createTestProject,
	cleanupTestProjects,
	uploadTestFile,
	getUploadUrl,
	uploadToPresignedUrl,
} from "../helpers/vms";
import { callMethod, callGetMethod, getDoc, getList, deleteDoc } from "../helpers/frappe";

test.describe("Version Upload", () => {
	let projectName: string;
	let assetName: string;
	const originalFileName = "e2e-version-test.mp4";

	test.beforeAll(async ({ request }) => {
		const project = await createTestProject(request, {
			project_name: `E2E Version Upload ${Date.now()}`,
		});
		projectName = project.name;

		// Upload a test file into the project
		const result = await uploadTestFile(request, {
			file_name: originalFileName,
			content: Buffer.from("original version content"),
			content_type: "video/mp4",
			project: projectName,
			category: "Footage",
		});
		assetName = result.asset_name;
	});

	test.afterAll(async ({ request }) => {
		// Clean up version history records first (they link to assets)
		try {
			const versions = await getList<{ name: string }>(
				request,
				"VMS Asset Version",
				{
					filters: { asset: assetName },
					fields: ["name"],
					limit: 100,
				},
			);
			for (const v of versions) {
				await deleteDoc(request, "VMS Asset Version", v.name).catch(
					() => {},
				);
			}
		} catch {
			// ignore
		}
		await cleanupTestProjects(request, "E2E Version Upload");
	});

	// -----------------------------------------------------------------------
	// API-level: version upload bumps version and creates history
	// -----------------------------------------------------------------------

	test("should upload a new version via API and bump version number", async ({
		request,
	}) => {
		// Verify original asset is v1
		const before = await getDoc<{
			version: number;
			file_name: string;
			status: string;
		}>(request, "VMS Asset", assetName);
		expect(before.version).toBe(1);
		expect(before.file_name).toBe(originalFileName);

		// Upload a new version
		const newContent = Buffer.from("new version content v2");
		const v2FileName = "e2e-version-test-v2.mp4";
		const { upload_url, asset_name: tempAssetName } = await getUploadUrl(
			request,
			{
				file_name: v2FileName,
				content_type: "video/mp4",
				project: projectName,
				category: "Footage",
			},
		);

		await uploadToPresignedUrl(request, upload_url, newContent, "video/mp4");

		// Confirm with version_of to trigger version swap
		await callMethod(request, "vms.api.confirm_upload", {
			asset_name: tempAssetName,
			file_size: newContent.length,
			version_of: assetName,
		});

		// Verify asset was updated in-place
		const after = await getDoc<{
			version: number;
			file_name: string;
			status: string;
		}>(request, "VMS Asset", assetName);
		expect(after.version).toBe(2);
		expect(after.file_name).toBe(v2FileName);
		expect(after.status).toBe("Ready");
	});

	test("should create a version history record", async ({ request }) => {
		const result = await callGetMethod<{
			current: { version_number: number; file_name: string };
			versions: Array<{ version_number: number; file_name: string }>;
			total_versions: number;
		}>(request, "vms.api.get_asset_versions", {
			asset_name: assetName,
		});

		// Current should be v2 (bumped by previous test)
		expect(result.current.version_number).toBe(2);

		// History should have v1
		expect(result.versions.length).toBeGreaterThanOrEqual(1);
		const v1 = result.versions.find((v) => v.version_number === 1);
		expect(v1).toBeTruthy();
		expect(v1!.file_name).toBe(originalFileName);

		expect(result.total_versions).toBeGreaterThanOrEqual(2);
	});

	// -----------------------------------------------------------------------
	// UI: version upload dialog from asset three-dot menu
	// -----------------------------------------------------------------------

	test("should open version upload dialog from asset three-dot menu", async ({
		page,
	}) => {
		await page.goto(`/vms/projects/${projectName}`);
		await page.waitForLoadState("networkidle");

		// Wait for asset card to appear (name may be truncated in card)
		await expect(
			page.locator('[role="tabpanel"]').getByText(/e2e-version-test/),
		).toBeVisible({ timeout: 10000 });

		// Right-click on the asset card text to open context menu
		await page
			.locator('[role="tabpanel"]')
			.getByText(/e2e-version-test/)
			.first()
			.click({ button: "right" });

		// Wait for context menu
		await expect(
			page.getByRole("menuitem", { name: "Upload new version" }),
		).toBeVisible({ timeout: 5000 });

		// Click "Upload new version"
		await page
			.getByRole("menuitem", { name: "Upload new version" })
			.click();

		// Verify dialog opens in version mode
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// 1) Title: "Upload New Version"
		await expect(
			dialog.getByRole("heading", { name: "Upload New Version" }),
		).toBeVisible();

		// 2) Description
		await expect(
			dialog.getByText("Replace the current file with a new version."),
		).toBeVisible();

		// 3) Asset context card with filename
		await expect(
			dialog.getByText("e2e-version-test-v2.mp4"),
		).toBeVisible();

		// 4) Version badge (e.g. "v2 → v3")
		await expect(dialog.getByText(/v\d+\s*→\s*v\d+/)).toBeVisible();

		// 5) Singular drop zone text
		await expect(
			dialog.getByText("Drop a file here or click to browse"),
		).toBeVisible();

		// 6) No category selector
		await expect(dialog.getByText("Category")).not.toBeVisible();
	});

	// -----------------------------------------------------------------------
	// UI: normal upload dialog still works (no regression)
	// -----------------------------------------------------------------------

	test("should show normal upload dialog with category selector", async ({
		page,
	}) => {
		await page.goto(`/vms/projects/${projectName}`);
		await page.waitForLoadState("networkidle");

		// Click the project-level "Upload" button
		await page
			.getByRole("button", { name: "Upload", exact: true })
			.last()
			.click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// 1) Title: "Upload Assets"
		await expect(
			dialog.getByRole("heading", { name: "Upload Assets" }),
		).toBeVisible();

		// 2) Description
		await expect(
			dialog.getByText("Upload files to this project."),
		).toBeVisible();

		// 3) Category selector visible
		await expect(dialog.getByText("Category")).toBeVisible();

		// 4) Plural drop zone text
		await expect(
			dialog.getByText("Drop files here or click to browse"),
		).toBeVisible();

		// 5) No version badge
		await expect(dialog.getByText(/v\d+\s*→\s*v\d+/)).not.toBeVisible();
	});
});
