<template>
	<!-- Guest page outside the shell: its own full-height root, no sidebar. -->
	<div
		class="flex h-screen flex-col bg-surface-base"
		:data-testid="isFolder ? 'shared-folder' : 'shared-project'"
	>
		<div v-if="!token" class="grid flex-1 place-items-center px-4">
			<EmptyState
				icon="lucide-link-2-off"
				title="Invalid share link"
				description="This link is missing a share token."
			/>
		</div>

		<div v-else-if="info.error" class="grid flex-1 place-items-center px-4">
			<EmptyState
				icon="lucide-link-2-off"
				title="Link expired or invalid"
				description="This share link is no longer valid."
			/>
		</div>

		<div v-else-if="!info.data" class="grid flex-1 place-items-center">
			<Spinner class="size-6 text-ink-gray-5" />
		</div>

		<template v-else>
			<PageHeaderBase class="flex min-h-12 shrink-0 items-center border-b px-3 sm:px-5">
				<PageHeaderTitle>
					<h1 class="truncate">{{ title }}</h1>
					<p class="truncate text-sm text-ink-gray-5" data-testid="shared-count">
						{{ total }} {{ total === 1 ? 'file' : 'files' }} shared
					</p>
				</PageHeaderTitle>
				<div class="ml-auto flex shrink-0 items-center gap-2">
					<Badge
						v-if="!isFolder && info.data.status"
						:label="info.data.status"
						theme="gray"
						variant="subtle"
					/>
					<Button
						v-if="assets.length"
						variant="subtle"
						icon-left="lucide-download"
						label="Download all"
						:loading="downloadingAll"
						data-testid="shared-download-all"
						@click="downloadAll"
					/>
				</div>
			</PageHeaderBase>

			<div class="min-h-0 flex-1 overflow-y-auto px-3 py-5 pb-10 sm:px-5">
				<div class="mx-auto max-w-6xl space-y-5">
					<!-- eslint-disable vue/no-v-html -- server-rendered Frappe HTML -->
					<div
						v-if="!isFolder && info.data.description"
						class="prose prose-sm max-w-none text-ink-gray-6"
						v-html="info.data.description"
					/>
					<!-- eslint-enable vue/no-v-html -->

					<div
						v-if="assetsCall.loading && !assets.length"
						class="grid place-items-center py-12"
					>
						<Spinner class="size-5 text-ink-gray-5" />
					</div>

					<EmptyState
						v-else-if="!assets.length"
						icon="lucide-film"
						title="No files shared"
					/>

					<div v-else class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
						<article
							v-for="asset in assets"
							:key="asset.name"
							class="group cursor-pointer overflow-hidden rounded-5 border border-outline-gray-1 bg-surface-base transition hover:border-outline-gray-2 hover:shadow-sm"
							data-testid="shared-asset-card"
							@click="open(asset)"
						>
							<div class="relative aspect-video bg-surface-gray-2">
								<img
									v-if="asset.thumbnail_url"
									:src="asset.thumbnail_url"
									alt=""
									class="size-full object-cover"
								/>
								<div
									v-else
									:class="[
										'grid size-full place-items-center',
										fileKindStyle(asset.file_type).tile,
									]"
								>
									<span
										:class="[fileKindStyle(asset.file_type).icon, 'size-8']"
										aria-hidden="true"
									/>
								</div>
							</div>
							<div class="flex items-start gap-2 p-3">
								<div class="min-w-0 flex-1">
									<p
										class="truncate text-base text-ink-gray-8"
										:title="asset.file_name"
									>
										{{ asset.file_name }}
									</p>
									<p
										class="mt-1 flex items-center gap-2 truncate text-sm text-ink-gray-5"
									>
										<span v-if="asset.file_size">{{
											formatBytes(asset.file_size)
										}}</span>
										<Badge
											:label="asset.category"
											theme="gray"
											variant="subtle"
										/>
									</p>
								</div>
								<Dropdown
									v-if="isConvertibleStill(asset.file_type, asset.file_name)"
									:options="downloadMenu(asset)"
									align="end"
								>
									<Button
										variant="ghost"
										icon="lucide-download"
										label="Download"
										@click.stop
									/>
								</Dropdown>
								<Button
									v-else
									variant="ghost"
									icon="lucide-download"
									label="Download"
									@click.stop="download(asset)"
								/>
							</div>
						</article>
					</div>

					<div v-if="totalPages > 1" class="flex items-center justify-center gap-3">
						<Button
							variant="outline"
							icon-left="lucide-arrow-left"
							label="Previous"
							:disabled="page <= 1"
							@click="page -= 1"
						/>
						<span class="text-sm text-ink-gray-5">
							Page {{ page }} of {{ totalPages }}
						</span>
						<Button
							variant="outline"
							icon-right="lucide-arrow-right"
							label="Next"
							:disabled="page >= totalPages"
							@click="page += 1"
						/>
					</div>

					<p
						class="border-t border-outline-gray-1 pt-4 text-center text-xs text-ink-gray-5"
					>
						Shared via VMS
					</p>
				</div>
			</div>
		</template>

		<MediaPreviewDialog
			v-if="preview"
			:open="Boolean(preview)"
			:url="preview.url"
			:name="preview.asset.file_name"
			:mime="preview.asset.file_type ?? ''"
			:download-url="preview.downloadUrl"
			:download-menu="
				isConvertibleStill(preview.asset.file_type, preview.asset.file_name)
					? downloadMenu(preview.asset)
					: undefined
			"
			@update:open="preview = null"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
	Badge,
	Button,
	Dropdown,
	PageHeaderBase,
	PageHeaderTitle,
	Spinner,
	toast,
	useCall,
	usePageMeta,
	type DropdownOption,
} from 'frappe-ui'
import type { ViewUrlResponse } from '@/types'
import EmptyState from '@/components/common/EmptyState.vue'
import { fileKindStyle, isConvertibleStill } from '@/lib/fileType'
import MediaPreviewDialog from '@/components/common/MediaPreviewDialog.vue'
import { formatBytes, serverMessage } from '@/lib/format'

interface SharedScope {
	name: string
	/** Set on a project share. */
	project_name?: string
	status?: string
	description?: string
	/** Set on a folder share. */
	folder_name?: string
}

interface SharedAsset {
	name: string
	file_name: string
	category: string
	file_size?: number
	file_type?: string
	uploaded_at?: string
	creation: string
	thumbnail_url?: string
}

interface SharedAssetsResponse {
	assets: SharedAsset[]
	total: number
	page: number
	page_size: number
	total_pages: number
}

interface ScopeParams {
	project?: string
	folder?: string
	token: string
}
type SharedAssetParams = ScopeParams & { asset_name: string }

const PAGE_SIZE = 20

const props = defineProps<{ projectId?: string; folderId?: string }>()

const route = useRoute()

const isFolder = computed(() => Boolean(props.folderId))
const scopeId = computed(() => props.folderId ?? props.projectId ?? '')

/** Share links carry their access token in the query string. */
const token = computed(() => {
	const value = route.query.token
	return typeof value === 'string' && value ? value : ''
})

const page = ref(1)
const preview = ref<{ asset: SharedAsset; url: string; downloadUrl?: string } | null>(null)
const downloadingAll = ref(false)

function scopeParams(): ScopeParams {
	return isFolder.value
		? { folder: props.folderId, token: token.value }
		: { project: props.projectId, token: token.value }
}

const infoUrl = computed(() =>
	isFolder.value
		? '/api/v2/method/vms.api.get_shared_folder'
		: '/api/v2/method/vms.api.get_shared_project',
)
const assetsUrl = computed(() =>
	isFolder.value
		? '/api/v2/method/vms.api.get_shared_folder_assets'
		: '/api/v2/method/vms.api.get_shared_project_assets',
)

const info = useCall<SharedScope, ScopeParams>({
	url: infoUrl,
	method: 'GET',
	params: scopeParams,
	immediate: Boolean(token.value),
	cacheKey: ['shared-info', scopeId.value],
})

const assetsCall = useCall<SharedAssetsResponse, ScopeParams & { page: number; page_size: number }>(
	{
		url: assetsUrl,
		method: 'GET',
		params: () => ({ ...scopeParams(), page: page.value, page_size: PAGE_SIZE }),
		immediate: Boolean(token.value),
		refetch: true,
		cacheKey: ['shared-assets', scopeId.value],
	},
)

const viewUrl = useCall<ViewUrlResponse, SharedAssetParams>({
	url: '/api/v2/method/vms.api.get_shared_asset_view_url',
	method: 'POST',
	immediate: false,
})

const downloadUrl = useCall<ViewUrlResponse, SharedAssetParams>({
	url: '/api/v2/method/vms.api.get_shared_asset_download_url',
	method: 'POST',
	immediate: false,
})

const assets = computed(() => assetsCall.data?.assets ?? [])
const total = computed(() => assetsCall.data?.total ?? 0)
const totalPages = computed(() => assetsCall.data?.total_pages ?? 1)
const title = computed(() => info.data?.folder_name ?? info.data?.project_name ?? '')

usePageMeta(() => ({ title: title.value ? `${title.value} · VMS` : 'Shared · VMS' }))

function paramsFor(asset: SharedAsset): SharedAssetParams {
	return { ...scopeParams(), asset_name: asset.name }
}

async function open(asset: SharedAsset) {
	try {
		const [view, dl] = await Promise.all([
			viewUrl.submit(paramsFor(asset)),
			downloadUrl.submit(paramsFor(asset)),
		])
		if (view?.url) preview.value = { asset, url: view.url, downloadUrl: dl?.url }
	} catch (error) {
		toast.error(serverMessage(error) || 'Could not open preview')
	}
}

/** Presigned download URLs carry Content-Disposition, so a plain navigation saves the file. */
async function download(asset: SharedAsset) {
	try {
		const result = await downloadUrl.submit(paramsFor(asset))
		if (result?.url) triggerDownload(result.url, asset.file_name)
	} catch (error) {
		toast.error(serverMessage(error) || 'Failed to download file')
	}
}

async function downloadAll() {
	downloadingAll.value = true
	try {
		for (const asset of assets.value) {
			await download(asset)
			// Give the browser a beat between downloads so none is dropped.
			await new Promise((resolve) => setTimeout(resolve, 300))
		}
	} finally {
		downloadingAll.value = false
	}
}

function downloadConverted(asset: SharedAsset, format: 'jpeg' | 'png') {
	const params = new URLSearchParams({ asset_name: asset.name, format, token: token.value })
	if (isFolder.value) params.set('folder', props.folderId ?? '')
	else params.set('project', props.projectId ?? '')
	const outName = asset.file_name.replace(/\.[^.]+$/, '') + (format === 'jpeg' ? '.jpg' : '.png')
	toast.info(`Preparing ${format.toUpperCase()}…`)
	triggerDownload(
		`/api/v2/method/vms.api.download_shared_converted_asset?${params.toString()}`,
		outName,
	)
}

function downloadMenu(asset: SharedAsset): DropdownOption[] {
	const ext = asset.file_name.match(/\.([^.]+)$/)?.[1]?.toUpperCase() ?? 'file'
	return [
		{ label: `Original (${ext})`, icon: 'lucide-download', onClick: () => download(asset) },
		{ label: 'JPEG', icon: 'lucide-image', onClick: () => downloadConverted(asset, 'jpeg') },
		{ label: 'PNG', icon: 'lucide-image', onClick: () => downloadConverted(asset, 'png') },
	]
}

function triggerDownload(url: string, fileName: string) {
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = fileName
	anchor.rel = 'noopener'
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
}
</script>
