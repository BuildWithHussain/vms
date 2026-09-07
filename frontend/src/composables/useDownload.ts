import { ref } from 'vue'
import { call, toast } from 'frappe-ui'
import type { ViewUrlResponse } from '@/types'

export type DownloadFormat = 'jpeg' | 'png'

function triggerDownload(url: string, fileName: string) {
	const a = document.createElement('a')
	a.href = url
	a.download = fileName
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
}

function convertedName(fileName: string, format: DownloadFormat) {
	return fileName.replace(/\.[^.]+$/, '') + (format === 'jpeg' ? '.jpg' : '.png')
}

/**
 * Presigned R2 downloads. With a guest review `token` the request goes through
 * `review_api.get_guest_download_url`; otherwise `api.get_download_url`.
 */
export function useDownload(token?: string | null) {
	const isDownloading = ref(false)

	async function getDownloadUrl(assetName: string): Promise<string> {
		const params: Record<string, string> = { asset_name: assetName }
		if (token) params.token = token
		const method = token ? 'vms.review_api.get_guest_download_url' : 'vms.api.get_download_url'
		const { url } = await call<ViewUrlResponse>(method, params)
		return url
	}

	async function downloadOne(assetName: string, fileName?: string) {
		isDownloading.value = true
		try {
			const url = await getDownloadUrl(assetName)
			triggerDownload(url, fileName || assetName)
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Download failed')
		} finally {
			isDownloading.value = false
		}
	}

	function downloadConverted(assetName: string, fileName: string, format: DownloadFormat) {
		const params = new URLSearchParams({ asset_name: assetName, format })
		if (token) params.set('token', token)
		const method = token
			? 'vms.review_api.download_guest_converted_asset'
			: 'vms.api.download_converted_asset'
		toast.info(`Preparing ${format.toUpperCase()}…`)
		triggerDownload(
			`/api/v2/method/${method}?${params.toString()}`,
			convertedName(fileName, format),
		)
	}

	async function downloadMany(assets: { name: string; file_name: string }[]) {
		isDownloading.value = true
		let failed = 0
		try {
			for (const asset of assets) {
				try {
					const url = await getDownloadUrl(asset.name)
					triggerDownload(url, asset.file_name)
					// Small delay between downloads so the browser handles them properly
					if (assets.length > 1) await new Promise((r) => setTimeout(r, 300))
				} catch {
					failed++
				}
			}
			if (failed > 0) toast.error(`${failed} download(s) failed`)
		} finally {
			isDownloading.value = false
		}
	}

	return { downloadOne, downloadConverted, downloadMany, isDownloading }
}
