import { test, expect } from "@playwright/test";
import {
	createTestProject,
	cleanupTestProjects,
	uploadTestFile,
	getUploadUrl,
	uploadToPresignedUrl,
	confirmUpload,
	getViewUrl,
	getDownloadUrl,
	deleteAsset,
} from "../helpers/vms";
import { callMethod } from "../helpers/frappe";

test.describe("Uploads", () => {
	let projectName: string;

	test.beforeAll(async ({ request }) => {
		const project = await createTestProject(request, {
			project_name: `E2E Upload Project ${Date.now()}`,
		});
		projectName = project.name;
	});

	test.afterAll(async ({ request }) => {
		await cleanupTestProjects(request, "E2E Upload Project");
	});

	test("should get a presigned upload URL", async ({ request }) => {
		const result = await getUploadUrl(request, {
			file_name: "test-video.mp4",
			content_type: "video/mp4",
			project: projectName,
		});

		expect(result.upload_url).toBeTruthy();
		expect(result.r2_key).toBeTruthy();
		expect(result.asset_name).toBeTruthy();
		expect(result.r2_key).toContain(".mp4");
	});

	test("should upload a file via presigned URL and confirm", async ({
		request,
	}) => {
		const content = Buffer.from("test video content for E2E");

		// Step 1: Get presigned URL
		const { upload_url, asset_name } = await getUploadUrl(request, {
			file_name: "e2e-test.mp4",
			content_type: "video/mp4",
			project: projectName,
		});

		// Step 2: Upload to presigned URL
		await uploadToPresignedUrl(request, upload_url, content, "video/mp4");

		// Step 3: Confirm upload
		const confirmResult = await confirmUpload(
			request,
			asset_name,
			content.length,
		);
		expect(confirmResult.status).toBe("ok");

		// Cleanup
		await deleteAsset(request, asset_name);
	});

	test("should complete full upload flow with helper", async ({
		request,
	}) => {
		const { asset_name, r2_key } = await uploadTestFile(request, {
			file_name: "full-flow-test.mp4",
			content: Buffer.from("full flow test content"),
			content_type: "video/mp4",
			project: projectName,
		});

		expect(asset_name).toBeTruthy();
		expect(r2_key).toBeTruthy();

		// Cleanup
		await deleteAsset(request, asset_name);
	});

	test("should generate a view URL for an uploaded asset", async ({
		request,
	}) => {
		const testContent = "view test content";
		const { asset_name } = await uploadTestFile(request, {
			file_name: "view-test.mp4",
			content: Buffer.from(testContent),
			content_type: "video/mp4",
			project: projectName,
		});

		const { url } = await getViewUrl(request, asset_name);
		expect(url).toBeTruthy();
		expect(url).toContain("X-Amz-Signature");

		// Verify the presigned URL actually returns the file
		const response = await request.get(url);
		expect(response.ok()).toBeTruthy();
		const body = await response.text();
		expect(body).toBe(testContent);

		// Cleanup
		await deleteAsset(request, asset_name);
	});

	test("should generate a download URL for an uploaded asset", async ({
		request,
	}) => {
		const testContent = "download test content";
		const { asset_name } = await uploadTestFile(request, {
			file_name: "download-test.mp4",
			content: Buffer.from(testContent),
			content_type: "video/mp4",
			project: projectName,
		});

		const { url } = await getDownloadUrl(request, asset_name);
		expect(url).toBeTruthy();
		expect(url).toContain("X-Amz-Signature");

		// Verify the presigned URL returns the file
		const response = await request.get(url);
		expect(response.ok()).toBeTruthy();
		const body = await response.text();
		expect(body).toBe(testContent);

		// Cleanup
		await deleteAsset(request, asset_name);
	});

	test("should delete an uploaded asset and its R2 object", async ({
		request,
	}) => {
		const { asset_name } = await uploadTestFile(request, {
			file_name: "delete-test.mp4",
			content: Buffer.from("delete test content"),
			content_type: "video/mp4",
			project: projectName,
		});

		// Delete the asset
		await deleteAsset(request, asset_name);

		// Verify the asset record is gone
		const response = await request.get(
			`/api/resource/VMS Asset/${encodeURIComponent(asset_name)}`,
		);
		expect(response.status()).toBe(404);
	});

	test("should upload to inbox when no project specified", async ({
		request,
	}) => {
		const { asset_name, r2_key } = await uploadTestFile(request, {
			file_name: "inbox-test.mp4",
			content: Buffer.from("inbox test content"),
			content_type: "video/mp4",
		});

		expect(r2_key).toMatch(/^inbox\//);

		// Cleanup
		await deleteAsset(request, asset_name);
	});

	test("should respect file category on upload", async ({ request }) => {
		const { asset_name } = await uploadTestFile(request, {
			file_name: "final-cut.mp4",
			content: Buffer.from("final cut content"),
			content_type: "video/mp4",
			project: projectName,
			category: "Final",
		});

		// Verify the category was set
		const assetResponse = await request.get(
			`/api/resource/VMS Asset/${encodeURIComponent(asset_name)}`,
		);
		expect(assetResponse.ok()).toBeTruthy();
		const assetData = await assetResponse.json();
		expect(assetData.data.category).toBe("Final");

		// Cleanup
		await deleteAsset(request, asset_name);
	});

	test("should test R2 connection successfully", async ({ request }) => {
		const result = await callMethod<{ status: string }>(
			request,
			"vms.api.test_r2_connection",
		);
		expect(result.status).toBe("ok");
	});
});
