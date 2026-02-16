import { test, expect, Page } from "@playwright/test";

/**
 * Call a Frappe API method from within the browser context (uses browser cookies).
 * This is necessary because Node.js request fixtures can't resolve .localhost domains.
 */
async function browserCallMethod(page: Page, method: string, args: Record<string, unknown> = {}) {
	// Ensure we're on a page first (needed for browser fetch context)
	const url = page.url();
	if (!url || url === "about:blank") {
		await page.goto("/vms");
		await page.waitForLoadState("domcontentloaded");
	}

	return page.evaluate(
		async ({ method, args }) => {
			const resp = await fetch(`/api/method/${method}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Frappe-CSRF-Token":
						(window as unknown as { csrf_token?: string }).csrf_token ||
							(window as unknown as { frappe?: { csrf_token?: string } }).frappe
								?.csrf_token || "",
				},
				body: JSON.stringify(args),
			});
			if (!resp.ok) {
				const text = await resp.text();
				throw new Error(`API call ${method} failed: ${resp.status} ${text}`);
			}
			return resp.json();
		},
		{ method, args },
	);
}

test.describe("Onboarding Setup Wizard", () => {
	test.afterEach(async ({ page }) => {
		// Always re-complete setup so other tests aren't affected
		try {
			await browserCallMethod(page, "vms.api.complete_setup");
		} catch {
			// May fail if page context is gone — that's OK
		}
	});

	test("should show setup wizard when setup is incomplete", async ({
		page,
	}) => {
		// First navigate to establish browser context, then reset setup
		await page.goto("/vms");
		await page.waitForLoadState("networkidle");
		await browserCallMethod(page, "vms.api.reset_setup");

		// Reload to trigger the wizard
		await page.reload();
		await page.waitForLoadState("networkidle");

		// Wizard should appear with the welcome heading
		await expect(
			page.locator("h1:has-text('Set up your workspace')"),
		).toBeVisible({ timeout: 15000 });

		// Step indicator buttons should be visible
		await expect(page.getByRole("button", { name: "Storage" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Team" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Uploads" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Formats" })).toBeVisible();
	});

	test("should start on Storage step with R2 fields", async ({ page }) => {
		await page.goto("/vms");
		await page.waitForLoadState("networkidle");
		await browserCallMethod(page, "vms.api.reset_setup");

		await page.reload();
		await page.waitForLoadState("networkidle");

		// Wait for wizard
		await expect(
			page.locator("h1:has-text('Set up your workspace')"),
		).toBeVisible({ timeout: 15000 });

		// Storage step should be active
		await expect(
			page.locator("h2:has-text('Cloudflare R2 Credentials')"),
		).toBeVisible();

		// R2 fields should exist
		await expect(page.locator("#r2_account_id")).toBeVisible();
		await expect(page.locator("#r2_access_key_id")).toBeVisible();
		await expect(page.locator("#r2_secret_access_key")).toBeVisible();
		await expect(page.locator("#r2_bucket_name")).toBeVisible();

		// Test Connection button should exist
		await expect(
			page.locator("button:has-text('Test Connection')"),
		).toBeVisible();
	});

	test("should navigate through all wizard steps", async ({ page }) => {
		await page.goto("/vms");
		await page.waitForLoadState("networkidle");
		await browserCallMethod(page, "vms.api.reset_setup");

		await page.reload();
		await page.waitForLoadState("networkidle");

		// Wait for wizard
		await expect(
			page.locator("h1:has-text('Set up your workspace')"),
		).toBeVisible({ timeout: 15000 });

		// Step 1: Storage — click Continue
		await expect(
			page.locator("h2:has-text('Cloudflare R2 Credentials')"),
		).toBeVisible();
		await page.locator("button:has-text('Continue')").click();

		// Step 2: Team — should see invite form
		await expect(
			page.locator("h2:has-text('Invite Your Team')"),
		).toBeVisible({ timeout: 5000 });
		await expect(
			page.locator("input[placeholder='email@example.com']"),
		).toBeVisible();
		// Skip button should be visible on Team step
		await expect(page.locator("button:has-text('Skip')")).toBeVisible();

		// Click Skip to move past Team
		await page.locator("button:has-text('Skip')").click();

		// Step 3: Uploads — should see max file size slider
		await expect(
			page.locator("h2:has-text('Upload Settings')"),
		).toBeVisible({ timeout: 5000 });
		await expect(page.locator("text=Max File Size")).toBeVisible();

		// Click Continue
		await page.locator("button:has-text('Continue')").click();

		// Step 4: Formats — should see file format config
		await expect(
			page.locator("h2:has-text('Allowed File Formats')"),
		).toBeVisible({ timeout: 5000 });

		// Finish Setup button should be visible on last step
		await expect(
			page.locator("button:has-text('Finish Setup')"),
		).toBeVisible();
	});

	test("should complete setup and show main app", async ({ page }) => {
		await page.goto("/vms");
		await page.waitForLoadState("networkidle");
		await browserCallMethod(page, "vms.api.reset_setup");

		await page.reload();
		await page.waitForLoadState("networkidle");

		// Wait for wizard
		await expect(
			page.locator("h1:has-text('Set up your workspace')"),
		).toBeVisible({ timeout: 15000 });

		// Step 1: Continue
		await page.locator("button:has-text('Continue')").click();
		await expect(
			page.locator("h2:has-text('Invite Your Team')"),
		).toBeVisible({ timeout: 5000 });

		// Step 2: Skip
		await page.locator("button:has-text('Skip')").click();
		await expect(
			page.locator("h2:has-text('Upload Settings')"),
		).toBeVisible({ timeout: 5000 });

		// Step 3: Continue
		await page.locator("button:has-text('Continue')").click();
		await expect(
			page.locator("h2:has-text('Allowed File Formats')"),
		).toBeVisible({ timeout: 5000 });

		// Step 4: Finish Setup
		await page.locator("button:has-text('Finish Setup')").click();

		// After completing, the main app should load (wizard disappears)
		await expect(
			page.locator("h1:has-text('Set up your workspace')"),
		).not.toBeVisible({ timeout: 15000 });

		// Main app layout should be visible (sidebar Dashboard link)
		await expect(
			page.locator("a:has-text('Dashboard'), [data-sidebar] >> text=Dashboard").first(),
		).toBeVisible({ timeout: 10000 });
	});

	test("should navigate back between steps", async ({ page }) => {
		await page.goto("/vms");
		await page.waitForLoadState("networkidle");
		await browserCallMethod(page, "vms.api.reset_setup");

		await page.reload();
		await page.waitForLoadState("networkidle");

		await expect(
			page.locator("h1:has-text('Set up your workspace')"),
		).toBeVisible({ timeout: 15000 });

		// Back button should be disabled on step 1
		const backBtn = page.locator("button:has-text('Back')");
		await expect(backBtn).toBeDisabled();

		// Go to step 2
		await page.locator("button:has-text('Continue')").click();
		await expect(
			page.locator("h2:has-text('Invite Your Team')"),
		).toBeVisible({ timeout: 5000 });

		// Back button should now be enabled
		await expect(backBtn).toBeEnabled();

		// Click back — should return to Storage
		await backBtn.click();
		await expect(
			page.locator("h2:has-text('Cloudflare R2 Credentials')"),
		).toBeVisible({ timeout: 5000 });
	});
});
