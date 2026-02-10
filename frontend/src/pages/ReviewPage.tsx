import { useRef, useState, useCallback } from "react"
import { useParams } from "react-router"
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { useReviewComments } from "@/hooks/useReviewComments"
import { useFabricCanvas } from "@/hooks/useFabricCanvas"
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
}

export function ReviewPage() {
  const { assetId } = useParams()
  const [currentTime, setCurrentTime] = useState(0)
  const seekToRef = useRef<((time: number) => void) | null>(null)

  // Annotation state
  const [annotationMode, setAnnotationMode] = useState(false)
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(null)
  const [replayAnnotation, setReplayAnnotation] = useState<string | null>(null)
  const replayTimestampRef = useRef<number | null>(null)

  const fabricCanvas = useFabricCanvas()

  const { call: fetchAnnotation } = useFrappePostCall("vms.review_api.get_annotation_data")

  const { data: reviewData } = useFrappeGetCall<{ message: ReviewData }>(
    "vms.review_api.get_review_data",
    assetId ? { asset_name: assetId } : undefined,
    assetId ? `review-data-${assetId}` : undefined,
    { revalidateOnFocus: false },
  )

  const { comments } = useReviewComments(assetId, "timestamp")

  const asset = reviewData?.message

  const handleSeek = useCallback((time: number) => {
    seekToRef.current?.(time)
    // Dismiss replay if seeking
    setReplayAnnotation(null)
    replayTimestampRef.current = null
  }, [])

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time)
    // Auto-dismiss annotation replay when playhead moves away
    if (replayTimestampRef.current != null && Math.abs(time - replayTimestampRef.current) > 0.5) {
      setReplayAnnotation(null)
      replayTimestampRef.current = null
    }
  }, [])

  // Start annotation mode (draw on canvas)
  const handleStartAnnotation = useCallback(() => {
    setAnnotationMode(true)
    setReplayAnnotation(null)
    replayTimestampRef.current = null
  }, [])

  // Cancel annotation mode without saving
  const handleCancelAnnotation = useCallback(() => {
    setAnnotationMode(false)
  }, [])

  // Done drawing — save annotation data and exit draw mode
  const handleAnnotationDone = useCallback(() => {
    const data = fabricCanvas.getAnnotationData()
    setPendingAnnotation(data)
    setAnnotationMode(false)
  }, [fabricCanvas])

  // View annotation replay from a comment
  const handleViewAnnotation = useCallback(
    async (commentName: string) => {
      const comment = comments.find((c) => c.name === commentName)
      if (!comment) return

      // Seek to comment timestamp
      if (comment.video_timestamp != null) {
        seekToRef.current?.(comment.video_timestamp)
      }

      // Fetch annotation data on demand
      try {
        const res = await fetchAnnotation({ comment_name: commentName })
        const annotationData = res.message?.annotation_data
        if (annotationData) {
          setAnnotationMode(false)
          setReplayAnnotation(annotationData)
          replayTimestampRef.current = comment.video_timestamp ?? null
        }
      } catch {
        // ignore fetch errors
      }
    },
    [comments, fetchAnnotation],
  )

  // Dismiss replay on click away or Escape
  const handleDismissReplay = useCallback(() => {
    setReplayAnnotation(null)
    replayTimestampRef.current = null
  }, [])

  // Handle Escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (replayAnnotation) {
          setReplayAnnotation(null)
          replayTimestampRef.current = null
        } else if (annotationMode) {
          // Cancel annotation without saving
          setAnnotationMode(false)
        }
      }
    },
    [replayAnnotation, annotationMode],
  )

  if (!assetId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">No asset specified.</p>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading review...</p>
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
      />

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
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
          />
        </div>

        {/* Comment panel */}
        <div className="min-h-0 flex-1 md:w-[380px] md:flex-none">
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
          />
        </div>
      </div>
    </div>
  )
}
