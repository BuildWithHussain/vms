import { h, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { dialog, toast, useCall, type DropdownOption } from 'frappe-ui'
import type { Asset } from '@/types'
import { serverMessage } from '@/lib/format'
import { isConvertibleStill } from '@/lib/fileType'
import { useDownload } from '@/composables/useDownload'
import { useVersionUpload } from '@/composables/useVersionUpload'

export type CardColor = '' | 'red' | 'amber' | 'green' | 'blue' | 'purple' | 'pink'

/** Swatch values match `ALLOWED_CARD_COLORS` in `vms/api.py`. */
export const CARD_COLORS: { value: CardColor; label: string; swatch: string }[] = [
	{ value: 'red', label: 'Red', swatch: 'bg-surface-red-5' },
	{ value: 'amber', label: 'Amber', swatch: 'bg-surface-amber-3' },
	{ value: 'green', label: 'Green', swatch: 'bg-surface-green-3' },
	{ value: 'blue', label: 'Blue', swatch: 'bg-surface-blue-3' },
	{ value: 'purple', label: 'Purple', swatch: 'bg-surface-violet-3' },
	{ value: 'pink', label: 'Pink', swatch: 'bg-surface-pink-3' },
]

const VIDEO_EXTENSIONS = new Set(['.mkv', '.avi', '.wmv', '.flv', '.webm', '.mov', '.ts', '.m4v'])

/** Mirrors `is_convertible_video` on the server so the menu never offers a call that throws. */
export function isConvertibleToMp4(asset: Asset): boolean {
	if (asset.status !== 'Ready' || asset.file_type === 'video/mp4') return false
	if (asset.file_type?.startsWith('video/')) return true
	// .mkv etc. often arrive as application/octet-stream — fall back to the extension.
	const ext = asset.file_name.toLowerCase().match(/\.[^.]+$/)?.[0]
	return ext ? VIDEO_EXTENSIONS.has(ext) : false
}

export interface AssetActionsContext {
	onChanged(): void
	/** Opens the rename dialog; falls back to `dialog.prompt` when absent. */
	openRename?(): void
	/** Opens the move-to-project dialog; the action is hidden when absent. */
	openMove?(): void
	/** Opens the tags dialog; the action is hidden when absent. */
	openTags?(): void
}

interface AssetParams {
	asset_name: string
}

/**
 * The ONE place asset row/card actions are defined. Guards read `asset.value`
 * lazily through `condition`, so the returned array itself is static and safe
 * to hand straight to `<Dropdown :options>`.
 */
export function useAssetActions(asset: Ref<Asset>, ctx: AssetActionsContext): DropdownOption[] {
	const router = useRouter()
	const { downloadOne, downloadConverted } = useDownload()
	const { openVersionUpload } = useVersionUpload()

	const isReady = () => asset.value.status === 'Ready'

	const renameCall = useCall<Asset, AssetParams & { new_file_name: string }>({
		url: '/api/v2/method/vms.api.rename_asset',
		method: 'POST',
		immediate: false,
	})
	const convertCall = useCall<unknown, AssetParams>({
		url: '/api/v2/method/vms.api.convert_asset_to_mp4',
		method: 'POST',
		immediate: false,
	})
	const shareCall = useCall<
		{ is_public_review: 0 | 1; review_token: string | null },
		AssetParams & { enable: number }
	>({
		url: '/api/v2/method/vms.review_api.toggle_public_review',
		method: 'POST',
		immediate: false,
	})
	const colorCall = useCall<{ card_color: string }, AssetParams & { color: string }>({
		url: '/api/v2/method/vms.api.set_asset_card_color',
		method: 'POST',
		immediate: false,
	})
	const deleteCall = useCall<{ status: string }, AssetParams>({
		url: '/api/v2/method/vms.api.delete_asset',
		method: 'POST',
		immediate: false,
	})
	const restoreCall = useCall<{ status: string }, AssetParams>({
		url: '/api/v2/method/vms.api.restore_asset',
		method: 'POST',
		immediate: false,
	})

	function rename() {
		if (ctx.openRename) return ctx.openRename()
		dialog.prompt({
			title: 'Rename asset',
			fields: [
				{ name: 'name', label: 'File name', required: true, defaultValue: asset.value.file_name },
			],
			confirmLabel: 'Rename',
			onConfirm: async ({ values }) => {
				await renameCall.submit({ asset_name: asset.value.name, new_file_name: values.name })
				toast.success('Asset renamed')
				ctx.onChanged()
			},
		})
	}

	async function convert() {
		try {
			await convertCall.submit({ asset_name: asset.value.name })
			toast.success('Conversion started')
			ctx.onChanged()
		} catch (e) {
			toast.error(serverMessage(e))
		}
	}

	function newVersion() {
		openVersionUpload(asset.value.name, ctx.onChanged)
	}

	async function shareLink() {
		try {
			let token = asset.value.is_public_review === 1 ? asset.value.review_token : null
			if (!token) {
				const result = await shareCall.submit({ asset_name: asset.value.name, enable: 1 })
				token = result?.review_token ?? null
				ctx.onChanged()
			}
			const url = `${window.location.origin}/vms/review/${asset.value.name}?token=${token}`
			await navigator.clipboard.writeText(url)
			toast.success('Review link copied')
		} catch (e) {
			toast.error(serverMessage(e))
		}
	}

	async function setColor(color: CardColor) {
		try {
			await colorCall.submit({ asset_name: asset.value.name, color })
			ctx.onChanged()
		} catch (e) {
			toast.error(serverMessage(e))
		}
	}

	function remove() {
		const name = asset.value.name
		const fileName = asset.value.file_name
		dialog.danger({
			title: 'Delete asset?',
			message: `"${fileName}" moves to Trash. You can restore it from there.`,
			onConfirm: async () => {
				await deleteCall.submit({ asset_name: name })
				ctx.onChanged()
				toast.success('Asset moved to Trash', {
					action: {
						label: 'Undo',
						onClick: async () => {
							try {
								await restoreCall.submit({ asset_name: name })
								toast.success('Asset restored')
								ctx.onChanged()
							} catch (e) {
								toast.error(serverMessage(e))
							}
						},
					},
				})
			},
		})
	}

	const colorSwatch = (swatch: string) => () =>
		h('span', { class: `inline-block size-3.5 rounded-full ${swatch}`, 'aria-hidden': 'true' })

	const colorOptions: DropdownOption[] = [
		...CARD_COLORS.map((c) => ({
			label: c.label,
			icon: colorSwatch(c.swatch),
			onClick: () => setColor(c.value),
		})),
		{
			label: 'No colour',
			icon: 'lucide-circle-off',
			onClick: () => setColor(''),
		},
	]

	const downloadOption: DropdownOption = isConvertibleStill(
		asset.value.file_type,
		asset.value.file_name,
	)
		? {
				label: 'Download',
				icon: 'lucide-download',
				condition: isReady,
				submenu: [
					{
						label: 'Original',
						icon: 'lucide-download',
						onClick: () => downloadOne(asset.value.name, asset.value.file_name),
					},
					{
						label: 'JPEG',
						icon: 'lucide-image',
						onClick: () => downloadConverted(asset.value.name, asset.value.file_name, 'jpeg'),
					},
					{
						label: 'PNG',
						icon: 'lucide-image',
						onClick: () => downloadConverted(asset.value.name, asset.value.file_name, 'png'),
					},
				],
			}
		: {
				label: 'Download',
				icon: 'lucide-download',
				condition: isReady,
				onClick: () => downloadOne(asset.value.name, asset.value.file_name),
			}

	return [
		{
			label: 'Review',
			icon: 'lucide-play',
			condition: isReady,
			onClick: () => router.push(`/review/${asset.value.name}`),
		},
		downloadOption,
		{
			label: 'Copy review link',
			icon: 'lucide-link',
			condition: isReady,
			onClick: shareLink,
		},
		{
			label: 'Convert to MP4',
			icon: 'lucide-arrow-left-right',
			condition: () => isConvertibleToMp4(asset.value),
			onClick: convert,
		},
		{
			label: 'Upload new version',
			icon: 'lucide-upload',
			condition: isReady,
			onClick: newVersion,
		},
		{ label: 'Rename', icon: 'lucide-pencil', onClick: rename },
		{
			label: 'Move to project',
			icon: 'lucide-folder-input',
			condition: () => !!ctx.openMove,
			onClick: () => ctx.openMove?.(),
		},
		{
			label: 'Tags',
			icon: 'lucide-tag',
			condition: () => !!ctx.openTags,
			onClick: () => ctx.openTags?.(),
		},
		{ label: 'Colour', icon: 'lucide-paintbrush', submenu: colorOptions },
		{ label: 'Delete', icon: 'lucide-trash-2', theme: 'red', onClick: remove },
	]
}
