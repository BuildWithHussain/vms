import { useRef, useState, useCallback } from "react"
import { useParams, useSearchParams } from "react-router"
import { useFrappeGetCall, useFrappePostCall, useFrappeAuth } from "frappe-react-sdk"
import { useReviewComments } from "@/hooks/useReviewComments"
import { useFabricCanvas } from "@/hooks/useFabricCanvas"
import { Spinner } from "@/components/ui/spinner"
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

  const [currentTime, setCurrentTime] = useState(0)
  const seekToRef = useRef<((time: number) => void) | null>(null)

  // Guest name state (persisted in localStorage)
  const [guestName, setGuestName] = useState<string>(
    () => localStorage.getItem("vms_guest_name") || "",
  )
  const handleSetGuestName = useCallback((name: string) => {
    setGuestName(name)
    localStorage.setItem("vms_guest_name", name)
  }, [])

  // Annotation state
  const [annotationMode, setAnnotationMode] = useState(false)
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(null)
  const [replayAnnotation, setReplayAnnotation] = useState<string | null>(null)
  const replayTimestampRef = useRef<number | null>(null)

  const fabricCanvas = useFabricCanvas()

  const { call: fetchAnnotation } = useFrappePostCall("vms.review_api.get_annotation_data")

  const { call: callTogglePublicReview } = useFrappePostCall("vms.review_api.toggle_public_review")

  const { data: reviewData, error: reviewError, mutate: mutateReviewData } = useFrappeGetCall<{ message: ReviewData }>(
    "vms.review_api.get_review_data",
    assetId
      ? { asset_name: assetId, ...(token ? { token } : {}) }
      : undefined,
    assetId ? `review-data-${assetId}` : undefined,
    { revalidateOnFocus: false },
  )

  const { comments } = useReviewComments(assetId, "timestamp", token)

  const asset = reviewData?.message

  const handleTogglePublicReview = useCallback(
    async (enable: boolean) => {
      if (!assetId) return
      await callTogglePublicReview({ asset_name: assetId, enable: enable ? 1 : 0 })
      mutateReviewData()
    },
    [assetId, callTogglePublicReview, mutateReviewData],
  )

  const handleSeek = useCallback((time: number) => {
    seekToRef.current?.(time)
    setReplayAnnotation(null)
    replayTimestampRef.current = null
  }, [])

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time)
    if (replayTimestampRef.current != null && Math.abs(time - replayTimestampRef.current) > 0.5) {
      setReplayAnnotation(null)
      replayTimestampRef.current = null
    }
  }, [])

  const handleStartAnnotation = useCallback(() => {
    setAnnotationMode(true)
    setReplayAnnotation(null)
    replayTimestampRef.current = null
  }, [])

  const handleCancelAnnotation = useCallback(() => {
    setAnnotationMode(false)
  }, [])

  const handleAnnotationDone = useCallback(() => {
    const data = fabricCanvas.getAnnotationData()
    setPendingAnnotation(data)
    setAnnotationMode(false)
  }, [fabricCanvas])

  const handleViewAnnotation = useCallback(
    async (commentName: string, timestamp?: number | null) => {
      if (timestamp != null) {
        seekToRef.current?.(timestamp)
      }

      try {
        const res = await fetchAnnotation({
          comment_name: commentName,
          ...(token ? { token } : {}),
        })
        const annotationData = res.message?.annotation_data
        if (annotationData) {
          setAnnotationMode(false)
          setReplayAnnotation(annotationData)
          replayTimestampRef.current = timestamp ?? null
        }
      } catch {
        // ignore fetch errors
      }
    },
    [fetchAnnotation, token],
  )

  const handleDismissReplay = useCallback(() => {
    setReplayAnnotation(null)
    replayTimestampRef.current = null
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (replayAnnotation) {
          setReplayAnnotation(null)
          replayTimestampRef.current = null
        } else if (annotationMode) {
          setAnnotationMode(false)
        }
      }
    },
    [replayAnnotation, annotationMode],
  )

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
    <div className="flex h-screen flex-col bg-background" onKeyDown={handleKeyDown} tabIndex={-1}>
      <ReviewHeader
        assetName={asset.name}
        fileName={asset.file_name}
        category={asset.category}
        project={asset.project}
        isGuest={isGuest}
        isPublicReview={asset.is_public_review === 1}
        reviewToken={asset.review_token}
        onTogglePublicReview={handleTogglePublicReview}
        token={token}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {/* Video section */}
        <div className="shrink-0 p-2 md:flex-1 md:p-4" onClick={replayAnnotation ? handleDismissReplay : undefined}>
          <VideoPlayer
            assetName={asset.name}
            comments={comments}
            onTimeUpdate={handleTimeUpdate}
            seekToRef={seekToRef}
            annotationMode={annotationMode}
            replayAnnotation={replayAnnotation}
            fabricCanvas={fabricCanvas}
            onCommentMarkerClick={handleViewAnnotation}
            token={token}
          />
        </div>

        {/* Comment panel */}
        <div className="min-h-[50vh] flex-1 md:min-h-0 md:w-[380px] md:flex-none">
          <CommentPanel
            assetId={assetId}
            currentTime={currentTime}
            onSeek={handleSeek}
            annotationMode={annotationMode}
            pendingAnnotation={pendingAnnotation}
            onStartAnnotation={handleStartAnnotation}
            onCancelAnnotation={handleCancelAnnotation}
            onAnnotationDone={handleAnnotationDone}
            onViewAnnotation={handleViewAnnotation}
            onClearAnnotation={() => setPendingAnnotation(null)}
            fabricCanvas={fabricCanvas}
            isGuest={isGuest}
            guestName={guestName}
            onSetGuestName={handleSetGuestName}
            token={token}
          />
        </div>
      </div>
    </div>
  )
}
