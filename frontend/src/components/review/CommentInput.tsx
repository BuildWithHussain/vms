import { useState, useRef, useEffect } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { MailSend01Icon, Clock01Icon, Cancel01Icon, PenTool01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatTimestamp } from "@/hooks/useVideoPlayer"

interface CommentInputProps {
  currentTime: number
  replyTo?: { name: string; commenterName: string; timestamp?: number | null } | null
  onSubmit: (text: string, timestamp?: number | null, parentComment?: string | null, annotationData?: string | null) => Promise<void>
  onCancelReply?: () => void
  isSubmitting: boolean
  onStartAnnotation?: () => void
  onCancelAnnotation?: () => void
  annotationMode?: boolean
  hasAnnotation?: boolean
}

export function CommentInput({
  currentTime,
  replyTo,
  onSubmit,
  onCancelReply,
  isSubmitting,
  onStartAnnotation,
  onCancelAnnotation,
  annotationMode = false,
  hasAnnotation = false,
}: CommentInputProps) {
  const [text, setText] = useState("")
  const [attachTimestamp, setAttachTimestamp] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea when replying
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus()
    }
  }, [replyTo])

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed) return

    const ts = attachTimestamp ? currentTime : null
    const parent = replyTo?.name ?? null
    await onSubmit(trimmed, ts, parent)
    setText("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "Escape" && replyTo) {
      onCancelReply?.()
    }
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
              onClick={annotationMode ? onCancelAnnotation : onStartAnnotation}
              title={annotationMode ? "Cancel annotation" : "Draw annotation"}
              className={hasAnnotation || annotationMode ? "text-primary" : ""}
            >
              <HugeiconsIcon icon={PenTool01Icon} size={14} strokeWidth={2} />
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {hasAnnotation ? "annotation attached" : attachTimestamp ? "timestamp attached" : "click to attach"}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment..."
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            rows={2}
          />
        </div>

        <Button
          size="icon-sm"
          onClick={handleSubmit}
          disabled={!text.trim() || isSubmitting}
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
