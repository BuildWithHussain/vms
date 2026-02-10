import { APIRequestContext } from "@playwright/test";
import { createDoc, deleteDoc, getDoc, getList } from "./frappe";

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
