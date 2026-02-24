import { APIRequestContext } from "@playwright/test";
import {
	callMethod,
	callGetMethod,
	createDoc,
	deleteDoc,
	getDoc,
	getList,
} from "./frappe";

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
		category: options.category ?? "Footage",
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
 * Deletes linked assets first to avoid LinkExistsError.
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
			// Delete linked assets first to avoid LinkExistsError
			const assets = await getList<VMSAsset>(request, "VMS Asset", {
				fields: ["name"],
				filters: { project: project.name },
				limit: 500,
			});
			for (const asset of assets) {
				try {
					await deleteDoc(request, "VMS Asset", asset.name);
				} catch (assetError) {
					console.warn(`Failed to delete asset ${asset.name}:`, assetError);
				}
			}
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
	const fileName = options.file_name || `test-file-${Date.now()}.mp4`;
	const contentType = options.content_type || "video/mp4";
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
 * Soft-delete an asset via the VMS API (moves to trash).
 */
export async function deleteAsset(
	request: APIRequestContext,
	assetName: string,
): Promise<void> {
	await callMethod(request, "vms.api.delete_asset", {
		asset_name: assetName,
	});
	// Permanently delete to clean up DB + R2 for tests
	await callMethod(request, "vms.api.permanently_delete_asset", {
		asset_name: assetName,
	});
}

// ---------------------------------------------------------------------------
// Sharing helpers
// ---------------------------------------------------------------------------

export interface ShareResult {
	share_token: string;
	share_url: string;
}

/**
 * Enable sharing on a project and return the share token + URL.
 */
export async function enableProjectSharing(
	request: APIRequestContext,
	projectName: string,
): Promise<ShareResult> {
	return callMethod<ShareResult>(request, "vms.api.enable_project_sharing", {
		project: projectName,
	});
}

/**
 * Disable sharing on a project (revokes all public links).
 */
export async function disableProjectSharing(
	request: APIRequestContext,
	projectName: string,
): Promise<void> {
	await callMethod(request, "vms.api.disable_project_sharing", {
		project: projectName,
	});
}

// ---------------------------------------------------------------------------
// Tools (compression) helpers
// ---------------------------------------------------------------------------

export interface ToolUploadUrlResponse {
	upload_url: string;
	r2_key: string;
}

export interface StartCompressionResponse {
	job_name: string;
	status: string;
}

export interface CompressStatusResponse {
	job_name: string;
	status: string;
	progress: number;
	original_file_name: string;
	original_size: number;
	compressed_size: number;
	compressed_file_name: string;
	error_message: string;
	download_url?: string;
}

export interface CompressJobsResponse {
	jobs: Array<{
		name: string;
		original_file_name: string;
		original_size: number;
		compressed_size: number;
		status: string;
		progress: number;
		creation: string;
	}>;
	total: number;
	page: number;
	page_size: number;
	total_pages: number;
}

/**
 * Get a presigned upload URL for a tool input file.
 */
export async function getToolUploadUrl(
	request: APIRequestContext,
	options: { file_name: string; content_type: string },
): Promise<ToolUploadUrlResponse> {
	return callMethod<ToolUploadUrlResponse>(
		request,
		"vms.tools_api.get_tool_upload_url",
		{
			file_name: options.file_name,
			content_type: options.content_type,
		},
	);
}

/**
 * Start a compression job.
 */
export async function startCompression(
	request: APIRequestContext,
	options: { r2_key: string; file_name: string; file_size?: number },
): Promise<StartCompressionResponse> {
	return callMethod<StartCompressionResponse>(
		request,
		"vms.tools_api.start_compression",
		{
			r2_key: options.r2_key,
			file_name: options.file_name,
			file_size: options.file_size ?? 0,
		},
	);
}

/**
 * Get the status of a compression job (GET endpoint).
 */
export async function getCompressStatus(
	request: APIRequestContext,
	jobName: string,
): Promise<CompressStatusResponse> {
	return callGetMethod<CompressStatusResponse>(
		request,
		"vms.tools_api.get_compress_status",
		{ job_name: jobName },
	);
}

/**
 * List compression jobs for the current user (GET endpoint).
 */
export async function getCompressJobs(
	request: APIRequestContext,
	options: { page?: number; page_size?: number } = {},
): Promise<CompressJobsResponse> {
	return callGetMethod<CompressJobsResponse>(
		request,
		"vms.tools_api.get_compress_jobs",
		{
			page: options.page ?? 1,
			page_size: options.page_size ?? 20,
		},
	);
}

/**
 * Cleanup compress jobs created during tests.
 */
export async function cleanupCompressJobs(
	request: APIRequestContext,
): Promise<void> {
	const result = await getCompressJobs(request, { page_size: 50 });
	for (const job of result.jobs) {
		try {
			await deleteDoc(request, "VMS Compress Job", job.name);
		} catch (error) {
			console.warn(`Failed to delete compress job ${job.name}:`, error);
		}
	}
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

export interface SearchAssetResult {
	name: string;
	file_name: string;
	project: string;
	category: string;
	file_type: string;
	project_name: string;
}

export interface SearchProjectResult {
	name: string;
	project_name: string;
	status: string;
}

/**
 * Search assets via the command palette search API (GET endpoint).
 */
export async function searchAssets(
	request: APIRequestContext,
	options: { query: string; project?: string; limit?: number },
): Promise<{ results: SearchAssetResult[] }> {
	const params: Record<string, string | number> = { query: options.query };
	if (options.project) params.project = options.project;
	if (options.limit) params.limit = options.limit;
	return callGetMethod<{ results: SearchAssetResult[] }>(
		request,
		"vms.api.search_assets",
		params,
	);
}

/**
 * Search projects via the command palette search API (GET endpoint).
 */
export async function searchProjects(
	request: APIRequestContext,
	options: { query: string; limit?: number },
): Promise<{ results: SearchProjectResult[] }> {
	const params: Record<string, string | number> = { query: options.query };
	if (options.limit) params.limit = options.limit;
	return callGetMethod<{ results: SearchProjectResult[] }>(
		request,
		"vms.api.search_projects",
		params,
	);
}
