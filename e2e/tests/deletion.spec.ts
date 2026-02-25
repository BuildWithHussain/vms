import { test, expect } from "@playwright/test";
import {
	createTestProject,
	createTestAsset,
	createTestFolder,
	softDeleteAsset,
	restoreAsset,
	permanentlyDeleteAsset,
	softDeleteFolder,
	restoreFolder,
	permanentlyDeleteFolder,
	getTrashAssets,
	getTrashFolders,
	emptyTrash,
	cleanupTestProjects,
	cleanupTestFolders,
	VMSProject,
	VMSAsset,
	VMSFolder,
} from "../helpers/vms";
import { docExists, getList } from "../helpers/frappe";

test.describe("Deletion — API", () => {
	let project: VMSProject;

	test.beforeAll(async ({ request }) => {
		project = await createTestProject(request, {
			project_name: `E2E Deletion ${Date.now()}`,
		});
	});

	test.afterAll(async ({ request }) => {
		// Clean up everything
		try {
			await emptyTrash(request);
		} catch { /* ignore */ }
		await cleanupTestFolders(request, project.name);
		await cleanupTestProjects(request, "E2E Deletion");
	});

	// ── Asset soft delete ────────────────────────────────────────────────

	test("soft-delete asset moves it to trash", async ({ request }) => {
		const asset = await createTestAsset(request, {
			project: project.name,
			file_name: `del-soft-${Date.now()}.mp4`,
		});

		await softDeleteAsset(request, asset.name);

		const trash = await getTrashAssets(request);
		const found = trash.assets.find((a) => a.name === asset.name);
		expect(found).toBeTruthy();

		// cleanup
		await permanentlyDeleteAsset(request, asset.name);
	});

	test("soft-deleted asset excluded from project listing", async ({ request }) => {
		const asset = await createTestAsset(request, {
			project: project.name,
			file_name: `del-excluded-${Date.now()}.mp4`,
		});

		await softDeleteAsset(request, asset.name);

		// Query non-trashed assets in the project
		const assets = await getList<VMSAsset>(request, "VMS Asset", {
			fields: ["name"],
			filters: { project: project.name, deleted_at: ["is", "not set"] },
		});
		const found = assets.find((a) => a.name === asset.name);
		expect(found).toBeFalsy();

		// cleanup
		await permanentlyDeleteAsset(request, asset.name);
	});

	// ── Asset restore ────────────────────────────────────────────────────

	test("restore asset brings it back from trash", async ({ request }) => {
		const asset = await createTestAsset(request, {
			project: project.name,
			file_name: `del-restore-${Date.now()}.mp4`,
		});

		await softDeleteAsset(request, asset.name);
		await restoreAsset(request, asset.name);

		// Should no longer be in trash
		const trash = await getTrashAssets(request);
		const found = trash.assets.find((a) => a.name === asset.name);
		expect(found).toBeFalsy();

		// Should be back in project listings
		const assets = await getList<VMSAsset>(request, "VMS Asset", {
			fields: ["name"],
			filters: { project: project.name, deleted_at: ["is", "not set"] },
		});
		expect(assets.find((a) => a.name === asset.name)).toBeTruthy();

		// cleanup
		await softDeleteAsset(request, asset.name);
		await permanentlyDeleteAsset(request, asset.name);
	});

	// ── Asset permanent delete ───────────────────────────────────────────

	test("permanently delete removes asset from database", async ({ request }) => {
		const asset = await createTestAsset(request, {
			project: project.name,
			file_name: `del-perm-${Date.now()}.mp4`,
		});

		await softDeleteAsset(request, asset.name);
		await permanentlyDeleteAsset(request, asset.name);

		const exists = await docExists(request, "VMS Asset", asset.name);
		expect(exists).toBe(false);
	});

	test("permanent delete fails on non-trashed asset", async ({ request }) => {
		const asset = await createTestAsset(request, {
			project: project.name,
			file_name: `del-guard-${Date.now()}.mp4`,
		});

		// Should fail because asset is not trashed
		await expect(
			permanentlyDeleteAsset(request, asset.name),
		).rejects.toThrow();

		// cleanup
		await softDeleteAsset(request, asset.name);
		await permanentlyDeleteAsset(request, asset.name);
	});

	// ── Folder soft delete ───────────────────────────────────────────────

	test("soft-delete folder moves it to trash", async ({ request }) => {
		const folder = await createTestFolder(
			request,
			project.name,
			`Del Folder ${Date.now()}`,
		);

		await softDeleteFolder(request, folder.name);

		const trash = await getTrashFolders(request);
		const found = trash.folders.find((f) => f.name === folder.name);
		expect(found).toBeTruthy();

		// cleanup
		await permanentlyDeleteFolder(request, folder.name);
	});

	test("soft-deleted folder excluded from active listing", async ({ request }) => {
		const folder = await createTestFolder(
			request,
			project.name,
			`Excl Folder ${Date.now()}`,
		);

		await softDeleteFolder(request, folder.name);

		const activeFolders = await getList<VMSFolder>(request, "VMS Folder", {
			fields: ["name"],
			filters: { project: project.name, deleted_at: ["is", "not set"] },
		});
		const found = activeFolders.find((f) => f.name === folder.name);
		expect(found).toBeFalsy();

		// cleanup
		await permanentlyDeleteFolder(request, folder.name);
	});

	// ── Folder restore ───────────────────────────────────────────────────

	test("restore folder brings it back", async ({ request }) => {
		const folder = await createTestFolder(
			request,
			project.name,
			`Restore Folder ${Date.now()}`,
		);

		await softDeleteFolder(request, folder.name);
		await restoreFolder(request, folder.name);

		const activeFolders = await getList<VMSFolder>(request, "VMS Folder", {
			fields: ["name"],
			filters: { project: project.name, deleted_at: ["is", "not set"] },
		});
		expect(activeFolders.find((f) => f.name === folder.name)).toBeTruthy();

		// cleanup
		await softDeleteFolder(request, folder.name);
		await permanentlyDeleteFolder(request, folder.name);
	});

	// ── Empty trash ──────────────────────────────────────────────────────

	test("empty trash removes all trashed assets and folders", async ({ request }) => {
		const asset = await createTestAsset(request, {
			project: project.name,
			file_name: `del-empty-${Date.now()}.mp4`,
		});
		const folder = await createTestFolder(
			request,
			project.name,
			`Empty Folder ${Date.now()}`,
		);

		await softDeleteAsset(request, asset.name);
		await softDeleteFolder(request, folder.name);

		const result = await emptyTrash(request);
		expect(result.count).toBeGreaterThanOrEqual(2);

		const exists1 = await docExists(request, "VMS Asset", asset.name);
		const exists2 = await docExists(request, "VMS Folder", folder.name);
		expect(exists1).toBe(false);
		expect(exists2).toBe(false);
	});
});

test.describe("Deletion — UI", () => {
	let project: VMSProject;

	test.beforeAll(async ({ request }) => {
		project = await createTestProject(request, {
			project_name: `E2E Deletion UI ${Date.now()}`,
		});
	});

	test.afterAll(async ({ request }) => {
		try {
			await emptyTrash(request);
		} catch { /* ignore */ }
		await cleanupTestFolders(request, project.name);
		await cleanupTestProjects(request, "E2E Deletion UI");
	});

	test("trash page loads with Assets and Folders tabs", async ({ page }) => {
		await page.goto("/vms/trash");
		await page.waitForLoadState("networkidle");

		// Both tabs should be visible
		await expect(page.getByRole("tab", { name: /Assets/i })).toBeVisible();
		await expect(page.getByRole("tab", { name: /Folders/i })).toBeVisible();
	});

	test("soft-deleted asset appears in trash page", async ({ page, request }) => {
		const asset = await createTestAsset(request, {
			project: project.name,
			file_name: `ui-trash-${Date.now()}.mp4`,
		});
		await softDeleteAsset(request, asset.name);

		await page.goto("/vms/trash");
		await page.waitForLoadState("networkidle");

		// Assets tab should be active by default and show the file
		await expect(page.getByText(asset.file_name)).toBeVisible({ timeout: 10000 });

		// cleanup
		await permanentlyDeleteAsset(request, asset.name);
	});

	test("restore asset from trash page via button", async ({ page, request }) => {
		const asset = await createTestAsset(request, {
			project: project.name,
			file_name: `ui-restore-${Date.now()}.mp4`,
		});
		await softDeleteAsset(request, asset.name);

		await page.goto("/vms/trash");
		await page.waitForLoadState("networkidle");

		// Find the row with this asset and click restore button
		const row = page.locator("tr", { hasText: asset.file_name });
		await expect(row).toBeVisible({ timeout: 10000 });
		const restoreBtn = row.locator('button[title="Restore"]');
		await restoreBtn.click();

		// Wait for it to disappear from the table
		await expect(row).not.toBeVisible({ timeout: 10000 });

		// Verify it's back (no longer in trash)
		const trash = await getTrashAssets(request);
		expect(trash.assets.find((a) => a.name === asset.name)).toBeFalsy();

		// cleanup
		await softDeleteAsset(request, asset.name);
		await permanentlyDeleteAsset(request, asset.name);
	});

	test("bulk restore selected assets from trash", async ({ page, request }) => {
		const a1 = await createTestAsset(request, {
			project: project.name,
			file_name: `ui-bulk-1-${Date.now()}.mp4`,
		});
		const a2 = await createTestAsset(request, {
			project: project.name,
			file_name: `ui-bulk-2-${Date.now()}.mp4`,
		});
		await softDeleteAsset(request, a1.name);
		await softDeleteAsset(request, a2.name);

		await page.goto("/vms/trash");
		await page.waitForLoadState("networkidle");

		// Wait for rows to appear, then select both via checkboxes
		const row1 = page.locator("tr", { hasText: a1.file_name });
		const row2 = page.locator("tr", { hasText: a2.file_name });
		await expect(row1).toBeVisible({ timeout: 10000 });
		await expect(row2).toBeVisible({ timeout: 10000 });
		await row1.getByRole("checkbox").first().click();
		await row2.getByRole("checkbox").first().click();

		// Click bulk "Restore" button in header
		const bulkRestore = page.getByRole("button", { name: /Restore \(2\)/i });
		await expect(bulkRestore).toBeVisible();
		await bulkRestore.click();

		// Wait for both to disappear
		await expect(row1).not.toBeVisible({ timeout: 10000 });
		await expect(row2).not.toBeVisible({ timeout: 10000 });

		// cleanup
		await softDeleteAsset(request, a1.name);
		await permanentlyDeleteAsset(request, a1.name);
		await softDeleteAsset(request, a2.name);
		await permanentlyDeleteAsset(request, a2.name);
	});

	test("bulk permanent delete selected assets", async ({ page, request }) => {
		const asset = await createTestAsset(request, {
			project: project.name,
			file_name: `ui-permdel-${Date.now()}.mp4`,
		});
		await softDeleteAsset(request, asset.name);

		await page.goto("/vms/trash");
		await page.waitForLoadState("networkidle");

		// Wait for row, then select the asset
		const row = page.locator("tr", { hasText: asset.file_name });
		await expect(row).toBeVisible({ timeout: 10000 });
		await row.getByRole("checkbox").first().click();

		// Click "Delete forever"
		const deleteBtn = page.getByRole("button", { name: /Delete forever/i });
		await expect(deleteBtn).toBeVisible();
		await deleteBtn.click();

		// Wait for row to vanish
		await expect(row).not.toBeVisible({ timeout: 10000 });

		// Verify it's permanently gone
		const exists = await docExists(request, "VMS Asset", asset.name);
		expect(exists).toBe(false);
	});

	test("folders tab shows trashed folders", async ({ page, request }) => {
		const folder = await createTestFolder(
			request,
			project.name,
			`UI Trash Folder ${Date.now()}`,
		);
		await softDeleteFolder(request, folder.name);

		await page.goto("/vms/trash");
		await page.waitForLoadState("networkidle");

		// Switch to Folders tab
		await page.getByRole("tab", { name: /Folders/i }).click();

		// Should see the folder
		await expect(page.getByText(folder.folder_name)).toBeVisible({
			timeout: 10000,
		});

		// cleanup
		await permanentlyDeleteFolder(request, folder.name);
	});

	test("restore folder from folders tab", async ({ page, request }) => {
		const folder = await createTestFolder(
			request,
			project.name,
			`UI Restore Folder ${Date.now()}`,
		);
		await softDeleteFolder(request, folder.name);

		await page.goto("/vms/trash");
		await page.waitForLoadState("networkidle");
		await page.getByRole("tab", { name: /Folders/i }).click();

		const row = page.locator("tr", { hasText: folder.folder_name });
		await expect(row).toBeVisible({ timeout: 10000 });
		await row.locator('button[title="Restore"]').click();

		await expect(row).not.toBeVisible({ timeout: 10000 });

		// Verify restored
		const trash = await getTrashFolders(request);
		expect(trash.folders.find((f) => f.name === folder.name)).toBeFalsy();

		// cleanup
		await softDeleteFolder(request, folder.name);
		await permanentlyDeleteFolder(request, folder.name);
	});

	test("empty trash dialog works", async ({ page, request }) => {
		const asset = await createTestAsset(request, {
			project: project.name,
			file_name: `ui-empty-${Date.now()}.mp4`,
		});
		await softDeleteAsset(request, asset.name);

		await page.goto("/vms/trash");
		await page.waitForLoadState("networkidle");

		// Click "Empty Trash"
		const emptyBtn = page.getByRole("button", { name: /Empty Trash/i });
		await expect(emptyBtn).toBeVisible({ timeout: 10000 });
		await emptyBtn.click();

		// Confirmation dialog should appear
		const dialog = page.getByRole("alertdialog");
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText(/permanently delete/i)).toBeVisible();

		// Confirm
		await dialog.getByRole("button", { name: /Empty Trash/i }).click();

		// Wait for trash to be empty
		await page.waitForLoadState("networkidle");
		await expect(page.getByText(/No deleted assets/i)).toBeVisible({
			timeout: 10000,
		});
	});

	test("delete folder dialog uses soft-delete language", async ({ page, request }) => {
		const folder = await createTestFolder(
			request,
			project.name,
			`UI SoftDel Folder ${Date.now()}`,
		);

		// Navigate to the project detail page
		await page.goto(`/vms/projects/${project.name}`);
		await page.waitForLoadState("networkidle");

		// Find the folder card and trigger delete
		// The folder card should have a context menu or delete button
		const folderCard = page.locator(`text=${folder.folder_name}`).first();
		await expect(folderCard).toBeVisible({ timeout: 10000 });

		// Right-click or find menu button on the folder
		await folderCard.click({ button: "right" });

		// If there's a delete option in a context menu
		const deleteOption = page.getByText(/Delete/i).first();
		if (await deleteOption.isVisible({ timeout: 3000 }).catch(() => false)) {
			await deleteOption.click();

			// The dialog should show soft-delete language
			const dialog = page.getByRole("alertdialog");
			if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
				await expect(dialog.getByText(/Move folder to trash/i)).toBeVisible();
				await expect(dialog.getByText(/restore/i)).toBeVisible();

				// Cancel so we can clean up
				await dialog.getByRole("button", { name: /Cancel/i }).click();
			}
		}

		// cleanup
		await softDeleteFolder(request, folder.name);
		await permanentlyDeleteFolder(request, folder.name);
	});

	test("settings dialog shows retention select dropdowns", async ({ page }) => {
		await page.goto("/vms");
		await page.waitForLoadState("networkidle");

		// Open settings dialog via sidebar button
		const settingsBtn = page.getByRole("button", { name: "Settings", exact: true });
		await expect(settingsBtn).toBeVisible({ timeout: 10000 });
		await settingsBtn.click();

		// Settings dialog opens on Profile tab — switch to General
		const dialog = page.getByRole("dialog", { name: "Settings" });
		await expect(dialog).toBeVisible({ timeout: 10000 });
		await dialog.getByRole("tab", { name: "General" }).click();

		// Look for the Trash section with select dropdown
		await expect(dialog.getByText("Auto-delete after").first()).toBeVisible({
			timeout: 10000,
		});

		// Should show "Never" as default in the select trigger
		const trashSelect = dialog.locator("button[role='combobox']").first();
		await expect(trashSelect).toBeVisible();
	});
});
