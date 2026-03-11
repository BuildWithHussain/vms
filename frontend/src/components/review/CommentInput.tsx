import { useState, useRef, useEffect, useCallback } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { MailSend01Icon, Clock01Icon, Cancel01Icon, PenTool01Icon, Image02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatTimestamp } from "@/hooks/useVideoPlayer"
import { useReviewContext } from "@/hooks/useReviewContext"
import { useFrappePostCall } from "frappe-react-sdk"
import { CommentEditor, type CommentEditorHandle, type ImageUploadFn } from "./CommentEditor"

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
    assetId,
    token,
  } = useReviewContext()

  const hasAnnotation = !!pendingAnnotation

  const [attachTimestamp, setAttachTimestamp] = useState(true)
  const [localGuestName, setLocalGuestName] = useState(guestName)
  const editorRef = useRef<CommentEditorHandle>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const { call: callUploadImage } = useFrappePostCall("vms.review_api.upload_comment_image")

  const handleImageUpload: ImageUploadFn = useCallback(async (file: File) => {
    const res = await callUploadImage({
      asset_name: assetId,
      file_name: file.name,
      content_type: file.type,
      ...(token ? { token } : {}),
    })
    const { upload_url, view_url, r2_key } = res.message

    // PUT the file directly to R2
    await fetch(upload_url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    })

    return { src: view_url, r2Key: r2_key }
  }, [callUploadImage, assetId, token])

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
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => imageInputRef.current?.click()}
              title="Attach image"
            >
              <HugeiconsIcon icon={Image02Icon} size={14} strokeWidth={2} />
            </Button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) editorRef.current?.insertImage(file)
                e.target.value = ""
              }}
            />
            <span className="text-[10px] text-muted-foreground">
              {hasAnnotation ? "annotation attached" : attachTimestamp ? "timestamp attached" : "click to attach"}
            </span>
          </div>
          <CommentEditor
            ref={editorRef}
            onSubmit={handleSubmit}
            isGuest={isGuest}
            placeholder={isGuest ? "Add a comment..." : "Add a comment... Type @ to mention"}
            onImageUpload={handleImageUpload}
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
