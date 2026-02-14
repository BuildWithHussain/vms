import { useCallback } from "react"
import { useParams, useSearchParams } from "react-router"
import { useFrappeGetCall, useFrappePostCall, useFrappeAuth } from "frappe-react-sdk"
import { Spinner } from "@/components/ui/spinner"
import { ReviewProvider } from "@/contexts/ReviewContext"
import { useReviewContext } from "@/hooks/useReviewContext"
import { ReviewHeader } from "@/components/review/ReviewHeader"
import { VideoPlayer } from "@/components/review/VideoPlayer"
import { CommentPanel } from "@/components/review/CommentPanel"

interface ReviewData {
  name: string
  file_name: string
  file_type?: string
  file_size?: number
  status: string
  category: string
  duration_seconds?: number
  uploaded_by: string
  uploaded_at?: string
  project?: { name: string; project_name: string } | null
  is_public_review?: 0 | 1
  review_token?: string | null
}

export function ReviewPage() {
  const { assetId } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  const { currentUser, isLoading: authLoading } = useFrappeAuth()

  const isGuest = !currentUser || currentUser === "Guest"

  const { data: reviewData, error: reviewError, mutate: mutateReviewData } = useFrappeGetCall<{ message: ReviewData }>(
    "vms.review_api.get_review_data",
    assetId
      ? { asset_name: assetId, ...(token ? { token } : {}) }
      : undefined,
    assetId ? `review-data-${assetId}` : undefined,
    { revalidateOnFocus: false },
  )

  const asset = reviewData?.message

  // Auth loading state
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  // Not logged in and no token → redirect to login
  if (isGuest && !token) {
    window.location.href = "/login"
    return null
  }

  if (!assetId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">No asset specified.</p>
      </div>
    )
  }

  if (reviewError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground">This review link is invalid or has expired.</p>
        {isGuest && (
          <p className="text-sm text-muted-foreground">Please ask the reviewer to share a new link.</p>
        )}
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <ReviewProvider assetId={assetId} token={token} isGuest={isGuest}>
      <ReviewPageInner asset={asset} mutateReviewData={mutateReviewData} />
    </ReviewProvider>
  )
}

function ReviewPageInner({
  asset,
  mutateReviewData,
}: {
  asset: ReviewData
  mutateReviewData: () => void
}) {
  const { replayAnnotation, annotationMode, dismissReplay, cancelAnnotation } = useReviewContext()

  const { call: callTogglePublicReview } = useFrappePostCall("vms.review_api.toggle_public_review")

  const handleTogglePublicReview = useCallback(
    async (enable: boolean) => {
      await callTogglePublicReview({ asset_name: asset.name, enable: enable ? 1 : 0 })
      mutateReviewData()
    },
    [asset.name, callTogglePublicReview, mutateReviewData],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (replayAnnotation) {
          dismissReplay()
        } else if (annotationMode) {
          cancelAnnotation()
        }
      }
    },
    [replayAnnotation, annotationMode, dismissReplay, cancelAnnotation],
  )

  return (
    <div className="flex h-screen flex-col bg-background" onKeyDown={handleKeyDown} tabIndex={-1}>
      <ReviewHeader
        assetName={asset.name}
        fileName={asset.file_name}
        category={asset.category}
        project={asset.project}
        isPublicReview={asset.is_public_review === 1}
        reviewToken={asset.review_token}
        onTogglePublicReview={handleTogglePublicReview}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {/* Video section */}
        <div className="shrink-0 p-2 md:flex-1 md:p-4" onClick={replayAnnotation ? dismissReplay : undefined}>
          <VideoPlayer assetName={asset.name} />
        </div>

        {/* Comment panel */}
        <div className="min-h-[50vh] flex-1 md:min-h-0 md:w-[380px] md:flex-none">
          <CommentPanel />
        </div>
      </div>
    </div>
  )
}
