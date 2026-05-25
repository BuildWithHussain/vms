import { useState, useRef, useCallback } from "react"
import Lightbox from "yet-another-react-lightbox"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen"
import "yet-another-react-lightbox/styles.css"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  MailReply01Icon,
  Clock01Icon,
  PenTool01Icon,
  PencilEdit01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { formatTimestamp } from "@/hooks/useVideoPlayer"
import { CommentEditor, type CommentEditorHandle } from "./CommentEditor"
import type { VMSReviewComment } from "@/types"

interface CommentItemProps {
  comment: VMSReviewComment
  replies: VMSReviewComment[]
  onSeek: (time: number) => void
  onReply: (parentName: string, timestamp?: number | null) => void
  onResolve: (name: string, resolved: boolean) => void
  onDelete: (name: string) => void
  onEdit: (name: string, newText: string) => Promise<void>
  onViewAnnotation?: (commentName: string, timestamp?: number | null) => void
  onEditAnnotation?: (commentName: string, timestamp?: number | null) => Promise<void>
  currentUser?: string
  isNested?: boolean
  isGuest?: boolean
}

export function CommentItem({
  comment,
  replies,
  onSeek,
  onReply,
  onResolve,
  onDelete,
  onEdit,
  onViewAnnotation,
  onEditAnnotation,
  currentUser,
  isNested = false,
  isGuest = false,
}: CommentItemProps) {
  const [showReplies, setShowReplies] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [lightboxSlides, setLightboxSlides] = useState<{ src: string }[]>([])
  const [copied, setCopied] = useState(false)
  const editEditorRef = useRef<CommentEditorHandle>(null)

  const handleCopy = useCallback(async () => {
    const tmp = document.createElement("div")
    tmp.innerHTML = comment.comment_text
    const text = (tmp.textContent || tmp.innerText || "").trim()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard may be unavailable (e.g. insecure context); silently ignore
    }
  }, [comment.comment_text])
  const handleCommentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      if (target.tagName === "IMG") {
        e.stopPropagation()
        const container = target.closest("[data-comment-body]")
        if (!container) return
        const imgs = Array.from(container.querySelectorAll("img"))
        const slides = imgs.map((img) => ({ src: img.src }))
        const index = imgs.indexOf(target as HTMLImageElement)
        setLightboxSlides(slides)
        setLightboxIndex(index >= 0 ? index : 0)
        setLightboxOpen(true)
      }
    },
    [],
  )

  const hasTimestamp = comment.video_timestamp != null
  const isGuestComment = !!comment.guest_name && !comment.commented_by
  const isOwnComment = !!currentUser && comment.commented_by === currentUser

  return (
    <div className={isNested ? "ml-8 border-l pl-3" : ""}>
      <div
        className={`group cursor-pointer rounded-md px-3 py-2 hover:bg-muted/50 ${comment.is_resolved ? "opacity-60" : ""}`}
        onClick={() => {
          if (comment.has_annotation === 1) {
            onViewAnnotation?.(comment.name, comment.video_timestamp)
          } else if (hasTimestamp) {
            onSeek(comment.video_timestamp!)
          }
        }}
      >
        <div className="flex items-start gap-2">
          <Avatar size="sm" className="mt-0.5 shrink-0">
            {comment.commenter_image && (
              <AvatarImage src={comment.commenter_image} alt={comment.commenter_name} />
            )}
            <AvatarFallback>
              {comment.commenter_name?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {comment.commenter_name}
              </span>
              {isGuestComment && (
                <Badge variant="outline" className="text-[10px] shrink-0">Guest</Badge>
              )}
              {hasTimestamp && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer font-mono text-[10px] shrink-0"
                  onClick={() =>
                    comment.has_annotation === 1
                      ? onViewAnnotation?.(comment.name, comment.video_timestamp)
                      : onSeek(comment.video_timestamp!)
                  }
                >
                  <HugeiconsIcon icon={Clock01Icon} size={10} strokeWidth={2} />
                  {formatTimestamp(comment.video_timestamp!)}
                </Badge>
              )}
              {comment.has_annotation === 1 && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer text-[10px] shrink-0 gap-0.5"
                  onClick={() => onViewAnnotation?.(comment.name, comment.video_timestamp)}
                  title="View annotation"
                >
                  <HugeiconsIcon icon={PenTool01Icon} size={10} strokeWidth={2} />
                  Drawing
                </Badge>
              )}
              {comment.is_resolved === 1 && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  Resolved
                </Badge>
              )}
            </div>

            <div
              data-comment-body
              className="mt-0.5 text-sm text-foreground break-words [&_p]:mb-0 [&_.mention]:rounded [&_.mention]:bg-primary/10 [&_.mention]:px-1 [&_.mention]:py-0.5 [&_.mention]:font-medium [&_.mention]:text-primary [&_img]:mt-1.5 [&_img]:max-w-full [&_img]:rounded-md [&_img]:max-h-48 [&_img]:object-contain [&_img]:cursor-zoom-in"
              dangerouslySetInnerHTML={{ __html: comment.comment_text }}
              onClick={handleCommentClick}
            />

            <div className="mt-1 flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">
                {new Date(comment.creation).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {comment.is_edited === 1 && (
                  <span className="ml-1 italic">(edited)</span>
                )}
              </span>

              <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleCopy}
                  title={copied ? "Copied!" : "Copy comment"}
                >
                  <HugeiconsIcon
                    icon={copied ? Tick02Icon : Copy01Icon}
                    size={14}
                    strokeWidth={2}
                    className={copied ? "text-green-500" : ""}
                  />
                </Button>
                {!isNested && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onReply(comment.name, comment.video_timestamp)}
                    title="Reply"
                  >
                    <HugeiconsIcon icon={MailReply01Icon} size={14} strokeWidth={2} />
                  </Button>
                )}
                {isOwnComment && comment.has_annotation === 1 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onEditAnnotation?.(comment.name, comment.video_timestamp)}
                    title="Edit drawing"
                  >
                    <HugeiconsIcon icon={PenTool01Icon} size={14} strokeWidth={2} />
                  </Button>
                )}
                {isOwnComment && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowEditDialog(true)}
                    title="Edit"
                  >
                    <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
                  </Button>
                )}
                {!isGuest && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onResolve(comment.name, comment.is_resolved === 0)}
                      title={comment.is_resolved ? "Unresolve" : "Resolve"}
                    >
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        size={14}
                        strokeWidth={2}
                        className={comment.is_resolved ? "text-green-500" : ""}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setShowDeleteConfirm(true)}
                      title="Delete"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div>
          {replies.length > 1 && (
            <button
              className="ml-8 px-3 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowReplies(!showReplies)}
            >
              {showReplies ? "Hide" : "Show"} {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </button>
          )}
          {showReplies &&
            replies.map((reply) => (
              <CommentItem
                key={reply.name}
                comment={reply}
                replies={[]}
                onSeek={onSeek}
                onReply={onReply}
                onResolve={onResolve}
                onDelete={onDelete}
                onEdit={onEdit}
                onViewAnnotation={onViewAnnotation}
                onEditAnnotation={onEditAnnotation}
                currentUser={currentUser}
                isNested
                isGuest={isGuest}
              />
            ))}
        </div>
      )}

      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        slides={lightboxSlides}
        plugins={[Zoom, Fullscreen]}
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this comment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => onDelete(comment.name)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit comment</DialogTitle>
          </DialogHeader>
          <CommentEditor
            ref={editEditorRef}
            initialContent={comment.comment_text}
            placeholder="Edit your comment..."
            onSubmit={async () => {
              if (!editEditorRef.current || editEditorRef.current.isEmpty()) return
              setIsEditing(true)
              try {
                await onEdit(comment.name, editEditorRef.current.getHTML())
                setShowEditDialog(false)
              } finally {
                setIsEditing(false)
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={isEditing}
            >
              Cancel
            </Button>
            <Button
              disabled={isEditing}
              onClick={async () => {
                if (!editEditorRef.current || editEditorRef.current.isEmpty()) return
                setIsEditing(true)
                try {
                  await onEdit(comment.name, editEditorRef.current.getHTML())
                  setShowEditDialog(false)
                } finally {
                  setIsEditing(false)
                }
              }}
            >
              {isEditing ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
