import { APIRequestContext } from "@playwright/test";
import { callMethod, createDoc, deleteDoc, getDoc, getList } from "./frappe";

/**
 * VMS Project document interface.
 */
export interface VMSProject {
	name: string;
	project_name: string;
	status: string;
	owner_user?: string;
	due_date?: string;
	description?: string;
	creation?: string;
	modified?: string;
}

/**
 * VMS Asset document interface.
 */
export interface VMSAsset {
	name: string;
	project: string;
	file_name: string;
	category: string;
	status: string;
	r2_key?: string;
	file_size?: number;
	file_type?: string;
	uploaded_by?: string;
	creation?: string;
	modified?: string;
}

/**
 * Generate a unique project name for tests.
 */
export function generateProjectName(prefix = "E2E Test Project"): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `${prefix} ${timestamp}-${random}`;
}

/**
 * Create a test VMS Project via API.
 */
export async function createTestProject(
	request: APIRequestContext,
	options: {
		project_name?: string;
		status?: string;
		description?: string;
	} = {},
): Promise<VMSProject> {
	const project_name = options.project_name || generateProjectName();

	return createDoc<VMSProject>(request, "VMS Project", {
		project_name,
		status: options.status ?? "Open",
		description: options.description || `Test project: ${project_name}`,
		owner_user: "Administrator",
	});
}

/**
 * Delete a test VMS Project via API.
 */
export async function deleteTestProject(
	request: APIRequestContext,
	name: string,
): Promise<void> {
	await deleteDoc(request, "VMS Project", name);
}

/**
 * Get a VMS Project by name via API.
 */
export async function getProject(
	request: APIRequestContext,
	name: string,
): Promise<VMSProject> {
	return getDoc<VMSProject>(request, "VMS Project", name);
}

/**
 * List VMS Projects via API.
 */
export async function listProjects(
	request: APIRequestContext,
	options: {
		filters?: Record<string, unknown>;
		limit?: number;
	} = {},
): Promise<VMSProject[]> {
	return getList<VMSProject>(request, "VMS Project", {
		fields: ["name", "project_name", "status", "owner_user", "creation"],
		filters: options.filters,
		limit: options.limit,
	});
}

/**
 * Create a test VMS Asset via API.
 */
export async function createTestAsset(
	request: APIRequestContext,
	options: {
		project: string;
		file_name?: string;
		category?: string;
		status?: string;
	},
): Promise<VMSAsset> {
	const file_name = options.file_name || `test-video-${Date.now()}.mp4`;

	return createDoc<VMSAsset>(request, "VMS Asset", {
		project: options.project,
		file_name,
		category: options.category ?? "Source",
		status: options.status ?? "Ready",
	});
}

/**
 * Delete a test VMS Asset via API.
 */
export async function deleteTestAsset(
	request: APIRequestContext,
	name: string,
): Promise<void> {
	await deleteDoc(request, "VMS Asset", name);
}

/**
 * Cleanup test projects matching a name pattern.
 */
export async function cleanupTestProjects(
	request: APIRequestContext,
	namePattern = "E2E Test Project",
): Promise<void> {
	const projects = await listProjects(request, {
		filters: { project_name: ["like", `${namePattern}%`] },
		limit: 100,
	});

	for (const project of projects) {
		try {
			await deleteTestProject(request, project.name);
		} catch (error) {
			console.warn(`Failed to delete ${project.name}:`, error);
		}
	}
}

// ---------------------------------------------------------------------------
// Upload helpers
// ---------------------------------------------------------------------------

interface UploadUrlResponse {
	upload_url: string;
	r2_key: string;
	asset_name: string;
}

interface ConfirmUploadResponse {
	status: string;
	asset_name: string;
}

interface ViewUrlResponse {
	url: string;
}

interface DownloadUrlResponse {
	url: string;
}

/**
 * Request a presigned upload URL from the VMS API.
 */
export async function getUploadUrl(
	request: APIRequestContext,
	options: {
		file_name: string;
		content_type: string;
		project?: string;
		category?: string;
	},
): Promise<UploadUrlResponse> {
	return callMethod<UploadUrlResponse>(request, "vms.api.get_upload_url", {
		file_name: options.file_name,
		content_type: options.content_type,
		project: options.project,
		category: options.category,
	});
}

/**
 * Upload a buffer to the presigned URL (PUT request directly to object storage).
 */
export async function uploadToPresignedUrl(
	request: APIRequestContext,
	uploadUrl: string,
	content: Buffer,
	contentType: string,
): Promise<void> {
	const response = await request.put(uploadUrl, {
		data: content,
		headers: {
			"Content-Type": contentType,
		},
	});

	if (!response.ok()) {
		throw new Error(
			`Upload to presigned URL failed: ${response.status()} ${response.statusText()}`,
		);
	}
}

/**
 * Confirm an upload after the file has been PUT to object storage.
 */
export async function confirmUpload(
	request: APIRequestContext,
	assetName: string,
	fileSize: number,
): Promise<ConfirmUploadResponse> {
	return callMethod<ConfirmUploadResponse>(
		request,
		"vms.api.confirm_upload",
		{
			asset_name: assetName,
			file_size: fileSize,
		},
	);
}

/**
 * Get a presigned view URL for an asset.
 */
export async function getViewUrl(
	request: APIRequestContext,
	assetName: string,
): Promise<ViewUrlResponse> {
	return callMethod<ViewUrlResponse>(request, "vms.api.get_view_url", {
		asset_name: assetName,
	});
}

/**
 * Get a presigned download URL for an asset.
 */
export async function getDownloadUrl(
	request: APIRequestContext,
	assetName: string,
): Promise<DownloadUrlResponse> {
	return callMethod<DownloadUrlResponse>(
		request,
		"vms.api.get_download_url",
		{
			asset_name: assetName,
		},
	);
}

/**
 * Full upload flow: get presigned URL → PUT file → confirm upload.
 * Returns the asset name and r2 key.
 */
export async function uploadTestFile(
	request: APIRequestContext,
	options: {
		file_name?: string;
		content?: Buffer;
		content_type?: string;
		project?: string;
		category?: string;
	} = {},
): Promise<{ asset_name: string; r2_key: string }> {
	const fileName = options.file_name || `test-file-${Date.now()}.txt`;
	const contentType = options.content_type || "text/plain";
	const content = options.content || Buffer.from("E2E test file content");

	// Step 1: Get presigned upload URL
	const { upload_url, r2_key, asset_name } = await getUploadUrl(request, {
		file_name: fileName,
		content_type: contentType,
		project: options.project,
		category: options.category,
	});

	// Step 2: PUT file to object storage
	await uploadToPresignedUrl(request, upload_url, content, contentType);

	// Step 3: Confirm the upload
	await confirmUpload(request, asset_name, content.length);

	return { asset_name, r2_key };
}

/**
 * Delete an asset via the VMS API (cleans up both DB record and object storage).
 */
export async function deleteAsset(
	request: APIRequestContext,
	assetName: string,
): Promise<void> {
	await callMethod(request, "vms.api.delete_asset", {
		asset_name: assetName,
	});
}
