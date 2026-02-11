import { useState, useMemo, useCallback } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Sorting01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CommentItem } from "./CommentItem"
import { CommentInput } from "./CommentInput"
import { AnnotationToolbar } from "./AnnotationToolbar"
import { useReviewComments } from "@/hooks/useReviewComments"
import type { useFabricCanvas } from "@/hooks/useFabricCanvas"

interface CommentPanelProps {
  assetId: string
  currentTime: number
  onSeek: (time: number) => void
  annotationMode: boolean
  pendingAnnotation: string | null
  onStartAnnotation: () => void
  onCancelAnnotation: () => void
  onAnnotationDone: () => void
  onViewAnnotation: (commentName: string, timestamp?: number | null) => void
  onClearAnnotation: () => void
  fabricCanvas: ReturnType<typeof useFabricCanvas>
  isGuest?: boolean
  guestName?: string
  onSetGuestName?: (name: string) => void
  token?: string | null
}

export function CommentPanel({
  assetId,
  currentTime,
  onSeek,
  annotationMode,
  pendingAnnotation,
  onStartAnnotation,
  onCancelAnnotation,
  onAnnotationDone,
  onViewAnnotation,
  onClearAnnotation,
  fabricCanvas,
  isGuest = false,
  guestName = "",
  onSetGuestName,
  token,
}: CommentPanelProps) {
  const [sortBy, setSortBy] = useState<"timestamp" | "recent">("recent")
  const [replyTo, setReplyTo] = useState<{
    name: string
    commenterName: string
    timestamp?: number | null
  } | null>(null)

  const {
    comments,
    isLoading,
    isAdding,
    addComment,
    deleteComment,
    resolveComment,
  } = useReviewComments(assetId, sortBy, token)

  // Build thread tree: top-level comments + their replies
  const threadedComments = useMemo(() => {
    const topLevel = comments.filter((c) => !c.parent_comment)
    const replyMap = new Map<string, typeof comments>()
    for (const c of comments) {
      if (c.parent_comment) {
        const existing = replyMap.get(c.parent_comment) ?? []
        existing.push(c)
        replyMap.set(c.parent_comment, existing)
      }
    }
    return topLevel.map((c) => ({
      comment: c,
      replies: replyMap.get(c.name) ?? [],
    }))
  }, [comments])

  const topLevelCount = threadedComments.length

  const handleReply = useCallback(
    (parentName: string, timestamp?: number | null) => {
      const parent = comments.find((c) => c.name === parentName)
      setReplyTo({
        name: parentName,
        commenterName: parent?.commenter_name ?? "Unknown",
        timestamp,
      })
    },
    [comments],
  )

  const handleSubmit = useCallback(
    async (text: string, timestamp?: number | null, parentComment?: string | null, _annotationData?: string | null, submittedGuestName?: string | null) => {
      // Auto-capture annotation if still in draw mode
      let annotation = pendingAnnotation
      if (!annotation && annotationMode && fabricCanvas.hasContent()) {
        annotation = fabricCanvas.getAnnotationData()
      }
      await addComment(text, timestamp, parentComment, annotation, submittedGuestName)
      setReplyTo(null)
      // Clean up annotation state
      if (annotation || pendingAnnotation) onClearAnnotation()
      if (annotationMode) onAnnotationDone()
    },
    [addComment, pendingAnnotation, annotationMode, fabricCanvas, onClearAnnotation, onAnnotationDone],
  )

  return (
    <div className="flex h-full flex-col border-t md:border-t-0 md:border-l">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">
          Comments{topLevelCount > 0 ? ` (${topLevelCount})` : ""}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setSortBy(sortBy === "timestamp" ? "recent" : "timestamp")}
        >
          <HugeiconsIcon icon={Sorting01Icon} size={14} strokeWidth={2} />
          {sortBy === "timestamp" ? "By time" : "Recent"}
        </Button>
      </div>

      {/* Comment list */}
      <ScrollArea className="max-h-[40vh] flex-1 overflow-auto md:max-h-none">
        <div className="py-2">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading comments...
            </div>
          ) : threadedComments.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No comments yet. Be the first to add feedback.
            </div>
          ) : (
            threadedComments.map(({ comment, replies }) => (
              <CommentItem
                key={comment.name}
                comment={comment}
                replies={replies}
                onSeek={onSeek}
                onReply={handleReply}
                onResolve={resolveComment}
                onDelete={deleteComment}
                onViewAnnotation={onViewAnnotation}
                isGuest={isGuest}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <CommentInput
        currentTime={currentTime}
        replyTo={replyTo}
        onSubmit={handleSubmit}
        onCancelReply={() => setReplyTo(null)}
        isSubmitting={isAdding}
        onStartAnnotation={onStartAnnotation}
        onCancelAnnotation={onCancelAnnotation}
        annotationMode={annotationMode}
        hasAnnotation={!!pendingAnnotation}
        isGuest={isGuest}
        guestName={guestName}
        onSetGuestName={onSetGuestName}
      />

      {/* Annotation toolbar — docked below input */}
      {annotationMode && (
        <AnnotationToolbar
          activeTool={fabricCanvas.activeTool}
          activeColor={fabricCanvas.activeColor}
          canUndo={fabricCanvas.canUndo}
          canRedo={fabricCanvas.canRedo}
          onToolChange={fabricCanvas.changeTool}
          onColorChange={fabricCanvas.changeColor}
          onUndo={fabricCanvas.undo}
          onRedo={fabricCanvas.redo}
          onBack={onAnnotationDone}
        />
      )}
    </div>
  )
}
