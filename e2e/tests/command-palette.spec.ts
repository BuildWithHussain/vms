import { test, expect, Page } from "@playwright/test";

// The command palette is a shadcn Dialog wrapping a cmdk Command.
// The dialog uses role="dialog" and cmdk adds [cmdk-input], [cmdk-item] etc.
const DIALOG_SELECTOR = "div[role='dialog']:has([cmdk-input])";

/** Open the command palette via keyboard shortcut. */
async function openCommandPalette(page: Page) {
	await page.keyboard.press("Meta+k");
	// Wait for the command dialog to appear
	await expect(page.locator(DIALOG_SELECTOR)).toBeVisible({ timeout: 5000 });
}

test.describe("Command Palette (Cmd+K)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/vms");
		await page.waitForLoadState("networkidle");
		// Wait for the main app sidebar to load (Dashboard link in sidebar)
		await expect(
			page.locator("a:has-text('Dashboard'), [data-sidebar] >> text=Dashboard").first(),
		).toBeVisible({ timeout: 15000 });
	});

	test("should open with Cmd+K and close with Escape", async ({ page }) => {
		await openCommandPalette(page);

		// Search input should be visible
		const input = page.locator("[cmdk-input]");
		await expect(input).toBeVisible();

		// Close with Escape
		await page.keyboard.press("Escape");
		await expect(page.locator(DIALOG_SELECTOR)).not.toBeVisible({
			timeout: 3000,
		});
	});

	test("should show navigation commands", async ({ page }) => {
		await openCommandPalette(page);

		// Navigation commands should be visible
		await expect(
			page.locator("[cmdk-item]:has-text('Go to Dashboard')"),
		).toBeVisible();
		await expect(
			page.locator("[cmdk-item]:has-text('Go to Uncategorised')"),
		).toBeVisible();
		await expect(
			page.locator("[cmdk-item]:has-text('Go to Projects')"),
		).toBeVisible();
		await expect(
			page.locator("[cmdk-item]:has-text('Go to Audit Logs')"),
		).toBeVisible();
	});

	test("should show action commands", async ({ page }) => {
		await openCommandPalette(page);

		await expect(
			page.locator("[cmdk-item]:has-text('Upload Files')"),
		).toBeVisible();
		await expect(
			page.locator("[cmdk-item]:has-text('Open Settings')"),
		).toBeVisible();
		await expect(
			page.locator("[cmdk-item]:has-text('Invite User')"),
		).toBeVisible();
		await expect(
			page.locator("[cmdk-item]:has-text('Profile')"),
		).toBeVisible();
	});

	test("should navigate to Invite User (Settings > Users tab)", async ({
		page,
	}) => {
		await openCommandPalette(page);

		// Click "Invite User" action
		await page.locator("[cmdk-item]:has-text('Invite User')").click();

		// Command palette should close
		await expect(page.locator(DIALOG_SELECTOR)).not.toBeVisible({
			timeout: 3000,
		});

		// Settings dialog should open with Users tab active
		const settingsDialog = page.locator("div[role='dialog']:has-text('Settings')");
		await expect(settingsDialog).toBeVisible({ timeout: 5000 });

		// Users tab should be the active tab (base-ui sets aria-selected + data-active)
		await expect(
			settingsDialog.locator('button[role="tab"][data-active]:has-text("Users")'),
		).toBeVisible();
	});

	test("should navigate to Profile (Settings > Profile tab)", async ({
		page,
	}) => {
		await openCommandPalette(page);

		// Click "Profile" action
		await page.locator("[cmdk-item]:has-text('Profile')").click();

		// Command palette should close
		await expect(page.locator(DIALOG_SELECTOR)).not.toBeVisible({
			timeout: 3000,
		});

		// Settings dialog should open with Profile tab active
		const settingsDialog = page.locator("div[role='dialog']:has-text('Settings')");
		await expect(settingsDialog).toBeVisible({ timeout: 5000 });

		// Profile tab should be active (base-ui sets aria-selected + data-active)
		await expect(
			settingsDialog.locator('button[role="tab"][data-active]:has-text("Profile")'),
		).toBeVisible();
	});

	test("should navigate to Projects page via command", async ({ page }) => {
		await openCommandPalette(page);

		// Click "Go to Projects"
		await page.locator("[cmdk-item]:has-text('Go to Projects')").click();

		// Should navigate to projects page
		await expect(page).toHaveURL(/\/vms\/projects/, { timeout: 10000 });
	});

	test("should navigate to Uncategorised page via command", async ({ page }) => {
		await openCommandPalette(page);

		await page.locator("[cmdk-item]:has-text('Go to Uncategorised')").click();

		await expect(page).toHaveURL(/\/vms\/uncategorised/, { timeout: 10000 });
	});

	test("should navigate to Audit Logs page via command", async ({
		page,
	}) => {
		await openCommandPalette(page);

		await page.locator("[cmdk-item]:has-text('Go to Audit Logs')").click();

		await expect(page).toHaveURL(/\/vms\/audit-logs/, { timeout: 10000 });
	});

	test("should filter commands when typing", async ({ page }) => {
		await openCommandPalette(page);

		const input = page.locator("[cmdk-input]");
		await input.fill("invite");

		// "Invite User" should still be visible
		await expect(
			page.locator("[cmdk-item]:has-text('Invite User')"),
		).toBeVisible();

		// Unrelated navigation items should be hidden by cmdk filtering
		await expect(
			page.locator("[cmdk-item]:has-text('Go to Dashboard')"),
		).not.toBeVisible({ timeout: 2000 });
	});
});
