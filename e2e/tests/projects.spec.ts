import { test, expect } from "@playwright/test";
import {
	createTestProject,
	deleteTestProject,
	cleanupTestProjects,
	VMSProject,
} from "../helpers/vms";
import { docExists } from "../helpers/frappe";

test.describe("Projects", () => {
	let testProject: VMSProject;

	test.afterAll(async ({ request }) => {
		await cleanupTestProjects(request);
	});

	test("should display the projects page", async ({ page }) => {
		await page.goto("/vms/projects");
		await page.waitForLoadState("networkidle");

		// The projects page should load
		await expect(page).toHaveURL(/\/vms\/projects/);
	});

	test("should create a new project via UI", async ({ page }) => {
		await page.goto("/vms/projects");
		await page.waitForLoadState("networkidle");

		// Click the new project button
		const newProjectBtn = page.locator('button:has-text("New Project"), button:has-text("Create Project"), [data-testid="new-project"]');
		await expect(newProjectBtn.first()).toBeVisible({ timeout: 10000 });
		await newProjectBtn.first().click();

		// Fill in the project name
		const projectName = `E2E Test Project ${Date.now()}`;
		const nameInput = page.locator('input[placeholder*="project" i], input[name="project_name"], [data-fieldname="project_name"] input');
		await expect(nameInput.first()).toBeVisible({ timeout: 5000 });
		await nameInput.first().fill(projectName);

		// Submit the form
		const submitBtn = page.locator('button:has-text("Create"), button[type="submit"]');
		await submitBtn.first().click();

		// Should navigate to the project detail page or show success
		await page.waitForLoadState("networkidle");

		// Verify project was created by checking we're on a project page or it appears in the list
		await page.goto("/vms/projects");
		await page.waitForLoadState("networkidle");
		await expect(page.locator(`text=${projectName}`).first()).toBeVisible({ timeout: 10000 });
	});

	test("should create a project via API and see it in the list", async ({ page, request }) => {
		testProject = await createTestProject(request, {
			project_name: `E2E Test Project API ${Date.now()}`,
		});

		await page.goto("/vms/projects");
		await page.waitForLoadState("networkidle");

		// The API-created project should appear in the list
		await expect(
			page.locator(`text=${testProject.project_name}`).first(),
		).toBeVisible({ timeout: 10000 });
	});

	test("should navigate to project detail page", async ({ page, request }) => {
		if (!testProject) {
			testProject = await createTestProject(request, {
				project_name: `E2E Test Project Nav ${Date.now()}`,
			});
		}

		await page.goto("/vms/projects");
		await page.waitForLoadState("networkidle");

		// Click on the project
		await page.locator(`text=${testProject.project_name}`).first().click();

		// Should navigate to the project detail page
		await page.waitForLoadState("networkidle");
		await expect(page).toHaveURL(/\/vms\/projects\//);
	});

	test("should delete a project via API", async ({ request }) => {
		const tempProject = await createTestProject(request, {
			project_name: `E2E Test Project Delete ${Date.now()}`,
		});

		// Delete and verify
		await deleteTestProject(request, tempProject.name);

		// Verify it's gone
		const exists = await docExists(request, "VMS Project", tempProject.name);
		expect(exists).toBe(false);
	});
});
