import { useState, useRef, useEffect } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle02Icon,
  Delete02Icon,
  MailReply01Icon,
  Clock01Icon,
  PenTool01Icon,
  PencilEdit01Icon,
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
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { formatTimestamp } from "@/hooks/useVideoPlayer"
import type { VMSReviewComment } from "@/types"
import { CommentEditor, type CommentEditorHandle } from "./CommentEditor"

interface CommentItemProps {
  comment: VMSReviewComment
  replies: VMSReviewComment[]
  onSeek: (time: number) => void
  onReply: (parentName: string, timestamp?: number | null) => void
  onResolve: (name: string, resolved: boolean) => void
  onDelete: (name: string) => void
  onUpdate: (name: string, text: string) => void
  onViewAnnotation?: (commentName: string, timestamp?: number | null) => void
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
  onUpdate,
  onViewAnnotation,
  isNested = false,
  isGuest = false,
}: CommentItemProps) {
  const [showReplies, setShowReplies] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const editorRef = useRef<CommentEditorHandle>(null)
  const hasTimestamp = comment.video_timestamp != null
  const isGuestComment = !!comment.guest_name && !comment.commented_by

  const handleSaveEdit = () => {
    const html = editorRef.current?.getHTML()
    if (html && !editorRef.current?.isEmpty()) {
      onUpdate(comment.name, html)
      setIsEditing(false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  useEffect(() => {
    if (isEditing && editorRef.current) {
      editorRef.current.setContent(comment.comment_text)
      editorRef.current.focus()
    }
  }, [isEditing, comment.comment_text])

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

            {isEditing ? (
              <div className="mt-1">
                <CommentEditor
                  ref={editorRef}
                  placeholder="Edit your comment..."
                  isGuest={isGuest}
                  className="mb-2"
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="mt-0.5 text-sm text-foreground break-words [&_p]:mb-0 [&_.mention]:rounded [&_.mention]:bg-primary/10 [&_.mention]:px-1 [&_.mention]:py-0.5 [&_.mention]:font-medium [&_.mention]:text-primary"
                dangerouslySetInnerHTML={{ __html: comment.comment_text }}
              />
            )}

            <div className="mt-1 flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">
                {new Date(comment.creation).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>

              <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
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
                {!isGuest && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setIsEditing(true)}
                      title="Edit"
                    >
                      <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
                    </Button>
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
                onUpdate={onUpdate}
                onViewAnnotation={onViewAnnotation}
                isNested
                isGuest={isGuest}
              />
            ))}
        </div>
      )}

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
    </div>
  )
}
