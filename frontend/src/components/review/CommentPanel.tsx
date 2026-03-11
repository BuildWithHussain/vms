import { useState, useMemo, useCallback } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Sorting01Icon } from "@hugeicons/core-free-icons"
import { useFrappeAuth } from "frappe-react-sdk"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CommentItem } from "./CommentItem"
import { CommentInput } from "./CommentInput"
import { AnnotationToolbar } from "./AnnotationToolbar"
import { useReviewComments } from "@/hooks/useReviewComments"
import { useReviewContext } from "@/hooks/useReviewContext"

export function CommentPanel() {
  const {
    assetId,
    token,
    isGuest,
    assetVersion,
    versionFilter,
    setVersionFilter,
    annotationMode,
    pendingAnnotation,
    finishAnnotation,
    viewAnnotation,
    editAnnotation,
    editingAnnotationComment,
    clearPendingAnnotation,
    cancelAnnotation,
    fabricCanvas,
    seekTo,
  } = useReviewContext()

  const { currentUser } = useFrappeAuth()

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
    editComment,
    deleteComment,
    resolveComment,
    updateAnnotation,
  } = useReviewComments(assetId, sortBy, token, versionFilter)

  // Build version options: 1..assetVersion
  const versionOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [
      { value: "all", label: "All versions" },
    ]
    for (let v = assetVersion; v >= 1; v--) {
      options.push({
        value: String(v),
        label: v === assetVersion ? `v${v} (latest)` : `v${v}`,
      })
    }
    return options
  }, [assetVersion])

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

  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false)

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
      if (annotation || pendingAnnotation) clearPendingAnnotation()
      if (annotationMode) finishAnnotation()
    },
    [addComment, pendingAnnotation, annotationMode, fabricCanvas, clearPendingAnnotation, finishAnnotation],
  )

  const handleSaveAnnotation = useCallback(async () => {
    if (!editingAnnotationComment) return
    const data = fabricCanvas.getAnnotationData()
    if (!data) return
    setIsSavingAnnotation(true)
    try {
      await updateAnnotation(editingAnnotationComment, data)
      cancelAnnotation()
    } finally {
      setIsSavingAnnotation(false)
    }
  }, [editingAnnotationComment, fabricCanvas, updateAnnotation, cancelAnnotation])

  return (
    <div className="flex h-full flex-col border-t md:border-t-0 md:border-l">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">
          Comments{topLevelCount > 0 ? ` (${topLevelCount})` : ""}
        </h3>
        <div className="flex items-center gap-1">
          {assetVersion > 1 && (
            <Select
              value={String(versionFilter)}
              onValueChange={(val) =>
                setVersionFilter(val === "all" ? "all" : Number(val))
              }
            >
              <SelectTrigger className="h-7 w-auto gap-1 border-none px-2 text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {versionOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
      </div>

      {/* Comment list */}
      <ScrollArea className="max-h-[40vh] flex-1 overflow-auto md:max-h-none">
        <div className="py-2">
          {isLoading ? (
            <div className="space-y-4 px-4 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : threadedComments.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {versionFilter !== "all" && assetVersion > 1
                ? `No comments on v${versionFilter}.`
                : "No comments yet. Be the first to add feedback."}
            </div>
          ) : (
            threadedComments.map(({ comment, replies }) => (
              <CommentItem
                key={comment.name}
                comment={comment}
                replies={replies}
                onSeek={seekTo}
                onReply={handleReply}
                onResolve={resolveComment}
                onDelete={deleteComment}
                onEdit={editComment}
                onViewAnnotation={viewAnnotation}
                onEditAnnotation={editAnnotation}
                currentUser={currentUser ?? undefined}
                isGuest={isGuest}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <CommentInput
        replyTo={replyTo}
        onSubmit={handleSubmit}
        onCancelReply={() => setReplyTo(null)}
        isSubmitting={isAdding}
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
          onBack={editingAnnotationComment ? undefined : finishAnnotation}
          onSave={editingAnnotationComment ? handleSaveAnnotation : undefined}
          onCancel={editingAnnotationComment ? cancelAnnotation : undefined}
          isSaving={isSavingAnnotation}
        />
      )}
    </div>
  )
}
