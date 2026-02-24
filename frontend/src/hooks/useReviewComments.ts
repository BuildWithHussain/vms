import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { useCallback } from "react"
import type { VMSReviewComment } from "@/types"

export function useReviewComments(
  assetId: string | undefined,
  sortBy: string = "timestamp",
  token?: string | null,
) {
  const {
    data,
    isLoading,
    mutate,
  } = useFrappeGetCall<{ message: VMSReviewComment[] }>(
    "vms.review_api.get_comments",
    assetId
      ? {
          asset_name: assetId,
          sort_by: sortBy,
          ...(token ? { token } : {}),
        }
      : undefined,
    assetId ? `review-comments-${assetId}-${sortBy}` : undefined,
    {
      revalidateOnFocus: false,
    },
  )

  const { call: callAddComment, loading: isAdding } = useFrappePostCall(
    "vms.review_api.add_comment",
  )

  const { call: callDeleteComment } = useFrappePostCall(
    "vms.review_api.delete_comment",
  )

  const { call: callEditComment } = useFrappePostCall(
    "vms.review_api.edit_comment",
  )

  const { call: callResolveComment } = useFrappePostCall(
    "vms.review_api.resolve_comment",
  )

  const comments = data?.message ?? []

  const addComment = useCallback(
    async (
      commentText: string,
      videoTimestamp?: number | null,
      parentComment?: string | null,
      annotationData?: string | null,
      guestName?: string | null,
    ) => {
      const result = await callAddComment({
        asset_name: assetId,
        comment_text: commentText,
        video_timestamp: videoTimestamp ?? undefined,
        parent_comment: parentComment ?? undefined,
        annotation_data: annotationData ?? undefined,
        ...(token ? { token } : {}),
        ...(guestName ? { guest_name: guestName } : {}),
      })
      mutate()
      return result.message as VMSReviewComment
    },
    [assetId, token, callAddComment, mutate],
  )

  const editComment = useCallback(
    async (commentName: string, commentText: string) => {
      await callEditComment({ comment_name: commentName, comment_text: commentText })
      mutate()
    },
    [callEditComment, mutate],
  )

  const deleteComment = useCallback(
    async (commentName: string) => {
      await callDeleteComment({ comment_name: commentName })
      mutate()
    },
    [callDeleteComment, mutate],
  )

  const resolveComment = useCallback(
    async (commentName: string, isResolved: boolean) => {
      await callResolveComment({
        comment_name: commentName,
        is_resolved: isResolved ? 1 : 0,
      })
      mutate()
    },
    [callResolveComment, mutate],
  )

  return {
    comments,
    isLoading,
    isAdding,
    addComment,
    editComment,
    deleteComment,
    resolveComment,
    mutate,
  }
}
