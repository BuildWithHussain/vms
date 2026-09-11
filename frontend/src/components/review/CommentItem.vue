<template>
	<div :class="nested ? 'ml-8 border-l border-outline-gray-1 pl-2' : ''">
		<div
			class="group rounded-6 px-3 py-2"
			:class="[
				interactive ? 'cursor-pointer hover:bg-surface-gray-1' : '',
				comment.is_resolved ? 'opacity-60' : '',
			]"
			@click="openComment"
		>
			<div class="flex items-start gap-2.5">
				<Avatar
					class="mt-0.5 shrink-0"
					size="lg"
					:label="comment.commenter_name"
					:image="comment.commenter_image || undefined"
				/>
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-1.5">
						<span class="truncate text-sm-medium text-ink-gray-8">
							{{ comment.commenter_name }}
						</span>
						<Badge v-if="isGuestComment" variant="outline" size="sm">Guest</Badge>
						<Button
							v-if="hasTimestamp"
							variant="subtle"
							size="sm"
							class="font-mono"
							icon-left="lucide-clock-3"
							:label="formatTimestamp(comment.video_timestamp ?? 0)"
							@click.stop="openTimestamp"
						/>
						<Badge
							v-if="comment.has_annotation"
							theme="blue"
							variant="subtle"
							size="sm"
						>
							<span class="lucide-pen-tool size-3" />
							Drawing
						</Badge>
						<Badge
							v-if="comment.is_resolved"
							variant="outline"
							size="sm"
							label="Resolved"
						/>
					</div>

					<!-- eslint-disable vue/no-v-html -- editor HTML, sanitized by Frappe on save -->
					<div
						data-comment-body
						class="comment-body mt-1 break-words text-sm text-ink-gray-8"
						@click="handleBodyClick"
						v-html="comment.comment_text"
					/>
					<!-- eslint-enable vue/no-v-html -->

					<div class="mt-1.5 flex min-h-6 items-center gap-1">
						<span
							class="text-xs text-ink-gray-5"
							:title="formatDateTime(comment.creation)"
						>
							{{ fromNow(comment.creation) }}
							<template v-if="comment.is_edited"> · edited</template>
						</span>
						<div
							class="ml-auto flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
							@click.stop
						>
							<Button
								variant="ghost"
								size="sm"
								:aria-label="copied ? 'Copied' : 'Copy comment'"
								:title="copied ? 'Copied' : 'Copy comment'"
								@click="copyComment"
							>
								<span
									:class="copied ? 'lucide-check' : 'lucide-copy'"
									class="size-3.5"
								/>
							</Button>
							<Button
								v-if="!nested"
								variant="ghost"
								size="sm"
								aria-label="Reply"
								title="Reply"
								@click="emit('reply', comment)"
							>
								<span class="lucide-reply size-3.5" />
							</Button>
							<Button
								v-if="isOwner && comment.has_annotation"
								variant="ghost"
								size="sm"
								aria-label="Edit drawing"
								title="Edit drawing"
								@click="emit('edit-annotation', comment)"
							>
								<span class="lucide-pen-tool size-3.5" />
							</Button>
							<Button
								v-if="isOwner"
								variant="ghost"
								size="sm"
								aria-label="Edit comment"
								title="Edit"
								@click="openEditor"
							>
								<span class="lucide-pencil size-3.5" />
							</Button>
							<Button
								v-if="!review.isGuest.value"
								variant="ghost"
								size="sm"
								:aria-label="
									comment.is_resolved ? 'Reopen comment' : 'Resolve comment'
								"
								:title="comment.is_resolved ? 'Reopen' : 'Resolve'"
								@click="emit('resolve', comment, !comment.is_resolved)"
							>
								<span class="lucide-circle-check size-3.5" />
							</Button>
							<Button
								v-if="!review.isGuest.value"
								variant="ghost"
								theme="red"
								size="sm"
								aria-label="Delete comment"
								title="Delete"
								@click="confirmDelete"
							>
								<span class="lucide-trash-2 size-3.5" />
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div v-if="replies.length">
			<Button
				v-if="replies.length > 1"
				variant="ghost"
				size="sm"
				class="ml-9"
				@click="repliesOpen = !repliesOpen"
			>
				<span
					:class="repliesOpen ? 'lucide-chevron-up' : 'lucide-chevron-down'"
					class="size-3"
				/>
				{{ repliesOpen ? 'Hide' : 'Show' }} {{ replies.length }} replies
			</Button>
			<CommentItem
				v-for="reply in repliesOpen ? replies : []"
				:key="reply.name"
				:comment="reply"
				:replies="[]"
				nested
				@seek="(time) => emit('seek', time)"
				@reply="(item) => emit('reply', item)"
				@resolve="(item, resolved) => emit('resolve', item, resolved)"
				@remove="(item) => emit('remove', item)"
				@edit="(item, html) => emit('edit', item, html)"
				@view-annotation="(item) => emit('view-annotation', item)"
				@edit-annotation="(item) => emit('edit-annotation', item)"
			/>
		</div>

		<Dialog v-model:open="editOpen" title="Edit comment">
			<CommentEditor
				v-model="editDraft"
				placeholder="Edit your comment…"
				submit-label="Save"
				:submitting="saving"
				:prompt-for-guest="false"
				@submit="saveEdit"
			/>
		</Dialog>

		<Dialog v-model:open="previewOpen" bare size="xl">
			<template #default="{ close }">
				<div class="relative grid min-h-64 place-items-center bg-black-overlay-900 p-4">
					<Button
						variant="ghost"
						class="absolute right-3 top-3 text-ink-white"
						aria-label="Close image preview"
						@click="close"
					>
						<span class="lucide-x size-5" />
					</Button>
					<img
						:src="previewSource"
						alt="Comment attachment"
						class="max-h-[80vh] max-w-full object-contain"
					/>
				</div>
			</template>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Avatar, Badge, Button, Dialog, dialog } from 'frappe-ui'
import type { ReviewComment } from '@/types'
import CommentEditor from '@/components/review/CommentEditor.vue'
import { useReview } from '@/composables/useReview'
import { useSession } from '@/composables/useSession'
import { formatTimestamp } from '@/composables/useVideoPlayer'
import { formatDateTime, fromNow } from '@/lib/dates'

const props = withDefaults(
	defineProps<{ comment: ReviewComment; replies: ReviewComment[]; nested?: boolean }>(),
	{ nested: false },
)

const emit = defineEmits<{
	seek: [time: number]
	reply: [comment: ReviewComment]
	resolve: [comment: ReviewComment, resolved: boolean]
	remove: [comment: ReviewComment]
	edit: [comment: ReviewComment, html: string]
	'view-annotation': [comment: ReviewComment]
	'edit-annotation': [comment: ReviewComment]
}>()

const review = useReview()
const { userId } = useSession()
const repliesOpen = ref(true)
const copied = ref(false)
const editOpen = ref(false)
const editDraft = ref('')
const saving = ref(false)
const previewOpen = ref(false)
const previewSource = ref('')

const hasTimestamp = computed(() => props.comment.video_timestamp != null)
const interactive = computed(() => hasTimestamp.value || Boolean(props.comment.has_annotation))
const isGuestComment = computed(
	() => Boolean(props.comment.guest_name) && !props.comment.commented_by,
)
const isOwner = computed(() => Boolean(userId.value) && props.comment.commented_by === userId.value)

function openComment(event: MouseEvent) {
	if ((event.target as HTMLElement).closest('a, button, img')) return
	openTimestamp()
}

function openTimestamp() {
	if (props.comment.has_annotation) emit('view-annotation', props.comment)
	else if (props.comment.video_timestamp != null) emit('seek', props.comment.video_timestamp)
}

function handleBodyClick(event: MouseEvent) {
	const target = event.target as HTMLElement
	if (!(target instanceof HTMLImageElement)) return
	event.stopPropagation()
	previewSource.value = target.src
	previewOpen.value = true
}

async function copyComment() {
	const container = document.createElement('div')
	container.innerHTML = props.comment.comment_text
	try {
		await navigator.clipboard.writeText(container.textContent?.trim() ?? '')
		copied.value = true
		window.setTimeout(() => (copied.value = false), 1500)
	} catch {
		copied.value = false
	}
}

function openEditor() {
	editDraft.value = props.comment.comment_text
	editOpen.value = true
}

async function saveEdit(html: string) {
	if (saving.value) return
	saving.value = true
	try {
		emit('edit', props.comment, html)
		editOpen.value = false
	} finally {
		saving.value = false
	}
}

function confirmDelete() {
	dialog.danger({
		title: 'Delete comment?',
		message: props.replies.length
			? 'This comment and its replies will be deleted.'
			: 'This comment will be deleted.',
		onConfirm: () => emit('remove', props.comment),
	})
}
</script>

<style scoped>
.comment-body :deep(p) {
	margin: 0;
}

.comment-body :deep(.mention) {
	border-radius: 0.25rem;
	background: var(--surface-gray-2);
	padding: 0.125rem 0.25rem;
	font-weight: 500;
}

.comment-body :deep(img) {
	margin-top: 0.375rem;
	max-height: 12rem;
	max-width: 100%;
	cursor: zoom-in;
	border-radius: 0.5rem;
	object-fit: contain;
}
</style>
