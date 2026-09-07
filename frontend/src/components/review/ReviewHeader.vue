<template>
	<PageHeaderBase
		class="flex min-h-12 items-center gap-2 border-b border-outline-gray-1 bg-surface-base px-3 sm:px-4"
	>
		<Button variant="ghost" icon="lucide-arrow-left" aria-label="Back" @click="goBack" />
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<h1 class="truncate text-base-semibold text-ink-gray-9">{{ asset.file_name }}</h1>
			<Button
				v-if="asset.version"
				variant="subtle"
				:label="`v${asset.version}`"
				@click="review.panels.versions.value = true"
			/>
			<Badge
				v-if="asset.status !== 'Ready'"
				:label="asset.status"
				:theme="assetStatusTheme(asset.status)"
			/>
		</div>

		<Dropdown
			v-if="review.isGuest.value && canPickFormat"
			:options="downloadFormatOptions"
			align="end"
		>
			<Button
				variant="subtle"
				icon-left="lucide-download"
				label="Download"
				:loading="isDownloading"
			/>
		</Dropdown>
		<Button
			v-else-if="review.isGuest.value"
			variant="subtle"
			icon-left="lucide-download"
			label="Download"
			:loading="isDownloading"
			@click="downloadOne(asset.name, asset.file_name)"
		/>

		<template v-else>
			<Popover v-model:open="shareOpen" align="end">
				<template #trigger>
					<Button variant="solid" icon-left="lucide-share-2" label="Share" />
				</template>
				<div class="w-80 space-y-4 p-3">
					<Switch
						v-model="publicReview"
						label="Public review link"
						description="Anyone with this link can view and comment."
						:disabled="togglingPublic"
					/>
					<div v-if="publicReview && shareUrl" class="flex items-center gap-2">
						<TextInput
							:model-value="shareUrl"
							readonly
							aria-label="Review link"
							class="min-w-0 flex-1"
						/>
						<Button
							icon="lucide-copy"
							aria-label="Copy review link"
							@click="copyLink"
						/>
					</div>
				</div>
			</Popover>

			<Dropdown :options="menuOptions" align="end">
				<Button variant="ghost" icon="lucide-more-horizontal" aria-label="More actions" />
			</Dropdown>
		</template>
	</PageHeaderBase>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
	Badge,
	Button,
	Dropdown,
	PageHeaderBase,
	Popover,
	Switch,
	TextInput,
	toast,
	type DropdownOption,
} from 'frappe-ui'
import type { ReviewAsset } from '@/types'
import { assetStatusTheme } from '@/lib/status'
import { isConvertibleStill } from '@/lib/fileType'
import { useDownload } from '@/composables/useDownload'
import { useReview } from '@/composables/useReview'
import YoutubeIcon from '@/components/common/YoutubeIcon.vue'

const props = defineProps<{
	asset: ReviewAsset
	proxyStatus?: string
	generatingProxy?: boolean
	togglingPublic?: boolean
}>()

const emit = defineEmits<{
	'toggle-public': [enabled: boolean]
	'generate-proxy': []
}>()

const router = useRouter()
const review = useReview()
const shareOpen = ref(false)
const { downloadOne, downloadConverted, isDownloading } = useDownload(review.token)

const canPickFormat = computed(() =>
	isConvertibleStill(props.asset.file_type, props.asset.file_name),
)

const originalExt = computed(
	() => props.asset.file_name.match(/\.([^.]+)$/)?.[1]?.toUpperCase() ?? 'file',
)

const downloadFormatOptions = computed<DropdownOption[]>(() => [
	{
		label: `Original (${originalExt.value})`,
		icon: 'lucide-download',
		onClick: () => downloadOne(props.asset.name, props.asset.file_name),
	},
	{
		label: 'JPEG',
		icon: 'lucide-image',
		onClick: () => downloadConverted(props.asset.name, props.asset.file_name, 'jpeg'),
	},
	{
		label: 'PNG',
		icon: 'lucide-image',
		onClick: () => downloadConverted(props.asset.name, props.asset.file_name, 'png'),
	},
])

const publicReview = computed({
	get: () => props.asset.is_public_review === 1,
	set: (enabled: boolean) => emit('toggle-public', enabled),
})

const shareUrl = computed(() => {
	if (!props.asset.review_token) return ''
	return `${window.location.origin}/vms/review/${props.asset.name}?token=${props.asset.review_token}`
})

const menuOptions = computed<DropdownOption[]>(() => {
	const options: DropdownOption[] = [
		canPickFormat.value
			? { label: 'Download', icon: 'lucide-download', submenu: downloadFormatOptions.value }
			: {
					label: 'Download',
					icon: 'lucide-download',
					onClick: () => downloadOne(props.asset.name, props.asset.file_name),
				},
		{
			label: 'New version',
			icon: 'lucide-upload',
			onClick: () => (review.panels.versions.value = true),
		},
	]

	if (!props.asset.file_type?.startsWith('image/')) {
		options.push(
			{
				label:
					props.asset.transcription_status === 'Complete' ? 'Transcript' : 'Transcribe',
				icon: 'lucide-captions',
				onClick: () => (review.panels.transcription.value = true),
			},
			{
				label: 'Upload to YouTube',
				icon: YoutubeIcon,
				onClick: () => (review.panels.youtube.value = true),
			},
			{
				label: 'Split video',
				icon: 'lucide-scissors',
				onClick: () => (review.panels.split.value = true),
			},
			{
				label:
					props.proxyStatus === 'Error'
						? 'Retry streaming proxy'
						: 'Generate streaming proxy',
				icon: 'lucide-gauge',
				disabled: props.generatingProxy || props.proxyStatus === 'Processing',
				onClick: async () => {
					emit('generate-proxy')
				},
			},
		)
	}

	if (props.asset.project) {
		options.push({
			label: 'Open in project',
			icon: 'lucide-folder-open',
			onClick: async () => {
				await router.push(`/projects/${props.asset.project?.name}`)
			},
		})
	}
	return options
})

function goBack() {
	if (window.history.length > 1) router.back()
	else if (props.asset.project) void router.push(`/projects/${props.asset.project.name}`)
	else void router.push('/')
}

async function copyLink() {
	await navigator.clipboard.writeText(shareUrl.value)
	toast.success('Review link copied')
}
</script>
