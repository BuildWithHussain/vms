import { useState, useRef, useEffect } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { MailSend01Icon, Clock01Icon, Cancel01Icon, PenTool01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatTimestamp } from "@/hooks/useVideoPlayer"
import { useReviewContext } from "@/hooks/useReviewContext"
import { CommentEditor, type CommentEditorHandle } from "./CommentEditor"

interface CommentInputProps {
  replyTo?: { name: string; commenterName: string; timestamp?: number | null } | null
  onSubmit: (text: string, timestamp?: number | null, parentComment?: string | null, annotationData?: string | null, guestName?: string | null) => Promise<void>
  onCancelReply?: () => void
  isSubmitting: boolean
}

export function CommentInput({
  replyTo,
  onSubmit,
  onCancelReply,
  isSubmitting,
}: CommentInputProps) {
  const {
    currentTime,
    annotationMode,
    pendingAnnotation,
    startAnnotation,
    cancelAnnotation,
    isGuest,
    guestName,
    setGuestName,
  } = useReviewContext()

  const hasAnnotation = !!pendingAnnotation

  const [attachTimestamp, setAttachTimestamp] = useState(true)
  const [localGuestName, setLocalGuestName] = useState(guestName)
  const editorRef = useRef<CommentEditorHandle>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Sync localGuestName when prop changes
  useEffect(() => {
    setLocalGuestName(guestName)
  }, [guestName])

  // Focus editor when replying
  useEffect(() => {
    if (replyTo) {
      editorRef.current?.focus()
    }
  }, [replyTo])

  const handleNameBlur = () => {
    const trimmed = localGuestName.trim()
    if (trimmed && trimmed !== guestName) {
      setGuestName(trimmed)
    }
  }

  const handleSubmit = async () => {
    if (!editorRef.current || editorRef.current.isEmpty()) return

    // For guests, require a name
    if (isGuest) {
      const name = localGuestName.trim()
      if (!name) {
        nameInputRef.current?.focus()
        return
      }
      // Persist name on first submit
      if (name !== guestName) {
        setGuestName(name)
      }
    }

    const html = editorRef.current.getHTML()
    const ts = attachTimestamp ? currentTime : null
    const parent = replyTo?.name ?? null
    const nameToSend = isGuest ? localGuestName.trim() : null
    await onSubmit(html, ts, parent, null, nameToSend)
    editorRef.current.clearContent()
  }

  return (
    <div className="border-t p-3">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Replying to <strong>{replyTo.commenterName}</strong></span>
          <Button variant="ghost" size="icon-sm" onClick={onCancelReply}>
            <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
          </Button>
        </div>
      )}

      {/* Guest name input */}
      {isGuest && (
        <div className="mb-2">
          <input
            ref={nameInputRef}
            value={localGuestName}
            onChange={(e) => setLocalGuestName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                editorRef.current?.focus()
              }
            }}
            placeholder="Your name"
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      )}

      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Badge
              variant={attachTimestamp ? "secondary" : "outline"}
              className="cursor-pointer font-mono text-[10px] select-none"
              onClick={() => setAttachTimestamp(!attachTimestamp)}
            >
              <HugeiconsIcon icon={Clock01Icon} size={10} strokeWidth={2} />
              {formatTimestamp(currentTime)}
            </Badge>
            <Button
              variant={hasAnnotation || annotationMode ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={annotationMode ? cancelAnnotation : startAnnotation}
              title={annotationMode ? "Cancel annotation" : "Draw annotation"}
              className={hasAnnotation || annotationMode ? "text-primary" : ""}
            >
              <HugeiconsIcon icon={PenTool01Icon} size={14} strokeWidth={2} />
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {hasAnnotation ? "annotation attached" : attachTimestamp ? "timestamp attached" : "click to attach"}
            </span>
          </div>
          <CommentEditor
            ref={editorRef}
            onSubmit={handleSubmit}
            isGuest={isGuest}
            placeholder={isGuest ? "Add a comment..." : "Add a comment... Type @ to mention"}
          />
        </div>

        <Button
          size="icon-sm"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="mt-6"
        >
          <HugeiconsIcon icon={MailSend01Icon} size={16} strokeWidth={2} />
        </Button>
      </div>

      <p className="mt-1 text-[10px] text-muted-foreground">
        {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to send
      </p>
    </div>
  )
}
