<template>
	<Dialog :open="open" size="4xl" bare @update:open="emit('update:open', $event)">
		<template #default="{ close }">
			<div class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-2">
				<p class="flex-1 truncate text-base font-medium text-ink-gray-8">{{ name }}</p>
				<Dropdown v-if="downloadMenu?.length" :options="downloadMenu" align="end">
					<Button variant="ghost" icon-left="lucide-download" label="Download" />
				</Dropdown>
				<Button
					v-else-if="downloadUrl"
					variant="ghost"
					icon-left="lucide-download"
					label="Download"
					:link="downloadUrl"
				/>
				<Button variant="ghost" icon="lucide-x" label="Close" @click="close" />
			</div>
			<div
				class="relative flex max-h-[80vh] items-center justify-center bg-surface-gray-7 p-2"
			>
				<video
					v-if="isVideo"
					:src="url"
					controls
					autoplay
					class="max-h-[76vh] max-w-full rounded-4"
				/>
				<img
					v-else-if="shownUrl"
					ref="imageEl"
					:src="shownUrl"
					:alt="name"
					class="max-h-[76vh] max-w-full rounded-4 object-contain"
				/>
				<div
					v-else
					class="animate-pulse rounded-4 bg-surface-gray-6"
					:style="skeletonBox"
					role="status"
					aria-label="Loading image"
				/>

				<Button
					v-if="hasPrevious"
					class="absolute left-3 top-1/2 -translate-y-1/2"
					variant="solid"
					theme="gray"
					icon="lucide-chevron-left"
					aria-label="Previous image"
					@click="emit('previous')"
				/>
				<Button
					v-if="hasNext"
					class="absolute right-3 top-1/2 -translate-y-1/2"
					variant="solid"
					theme="gray"
					icon="lucide-chevron-right"
					aria-label="Next image"
					@click="emit('next')"
				/>
			</div>
		</template>
	</Dialog>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { Button, Dialog, Dropdown, type DropdownOption } from 'frappe-ui'

const props = defineProps<{
	open: boolean
	url: string
	name: string
	mime: string
	downloadUrl?: string
	downloadMenu?: DropdownOption[]
	hasPrevious?: boolean
	hasNext?: boolean
}>()

const emit = defineEmits<{
	'update:open': [value: boolean]
	previous: []
	next: []
}>()

const isVideo = computed(() => props.mime.startsWith('video/'))

// The <img> keeps painting the previous file until the new one decodes, so
// stepping through a folder used to swap the name and leave the old picture up.
// Decode off-screen first and only bind the src once it is ready.
const shownUrl = ref('')
const imageEl = ref<HTMLImageElement | null>(null)
// The skeleton takes over the outgoing image's box so the dialog does not
// resize twice on the way to the next picture.
const skeletonBox = ref({ height: '60vh', width: '100%' })
let loader: HTMLImageElement | null = null
let skeletonTimer: ReturnType<typeof setTimeout> | undefined

function clearSkeletonTimer() {
	if (skeletonTimer === undefined) return
	clearTimeout(skeletonTimer)
	skeletonTimer = undefined
}

function loadImage(url: string) {
	clearSkeletonTimer()
	loader = null
	if (!url) {
		shownUrl.value = ''
		return
	}
	if (url === shownUrl.value) return

	const image = new Image()
	loader = image
	// Hold the old frame for a beat: a cached image resolves inside it and never
	// flashes a skeleton.
	skeletonTimer = setTimeout(() => {
		if (loader !== image) return
		const box = imageEl.value
		if (box?.clientHeight) {
			skeletonBox.value = { height: `${box.clientHeight}px`, width: `${box.clientWidth}px` }
		}
		shownUrl.value = ''
	}, 120)
	image.onload = image.onerror = () => {
		if (loader !== image) return
		clearSkeletonTimer()
		shownUrl.value = url
	}
	image.src = url
}

watch(
	() => [props.open, props.url, isVideo.value] as const,
	([open, url, video]) => {
		if (!open || video) {
			clearSkeletonTimer()
			loader = null
			shownUrl.value = ''
			return
		}
		loadImage(url)
	},
	{ immediate: true },
)

// A video's own controls own the arrow keys (frame stepping, volume), so the
// gallery only claims them for stills.
const navigable = computed(() => props.open && !isVideo.value)

function handleArrowKeys(event: KeyboardEvent) {
	if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
	const target = event.target as HTMLElement | null
	if (target?.matches('input, textarea, [contenteditable="true"]')) return
	event.preventDefault()
	if (event.key === 'ArrowLeft' && props.hasPrevious) emit('previous')
	if (event.key === 'ArrowRight' && props.hasNext) emit('next')
}

watch(
	navigable,
	(active) => {
		if (active) document.addEventListener('keydown', handleArrowKeys)
		else document.removeEventListener('keydown', handleArrowKeys)
	},
	{ immediate: true },
)
onScopeDispose(() => {
	document.removeEventListener('keydown', handleArrowKeys)
	clearSkeletonTimer()
	loader = null
})
</script>
