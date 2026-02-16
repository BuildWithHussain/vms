import { useState } from "react"
import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Download04Icon, Link01Icon, Copy01Icon, SubtitleIcon } from "@hugeicons/core-free-icons"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { useDownload } from "@/hooks/useDownload"
import { useReviewContext } from "@/hooks/useReviewContext"
import { toast } from "sonner"

interface ReviewHeaderProps {
  assetName: string
  fileName: string
  category?: string
  project?: { name: string; project_name: string } | null
  isPublicReview?: boolean
  reviewToken?: string | null
  onTogglePublicReview?: (enable: boolean) => Promise<void>
  transcriptionStatus?: string
  onTranscribe?: () => Promise<void>
  isTranscribing?: boolean
  onOpenTranscription?: () => void
}

export function ReviewHeader({
  assetName,
  fileName,
  category,
  project,
  isPublicReview = false,
  reviewToken,
  onTogglePublicReview,
  transcriptionStatus,
  onTranscribe,
  isTranscribing,
  onOpenTranscription,
}: ReviewHeaderProps) {
  const navigate = useNavigate()
  const { isGuest, token } = useReviewContext()
  const { downloadOne, isDownloading } = useDownload(token)
  const [toggling, setToggling] = useState(false)

  const handleBack = () => {
    if (project) {
      navigate(`/projects/${project.name}`)
    } else {
      navigate("/inbox")
    }
  }

  const shareUrl = reviewToken
    ? `${window.location.origin}/vms/review/${assetName}?token=${reviewToken}`
    : ""

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success("Link copied to clipboard")
    } catch {
      toast.error("Failed to copy link")
    }
  }

  const handleToggle = async (checked: boolean) => {
    if (!onTogglePublicReview) return
    setToggling(true)
    try {
      await onTogglePublicReview(checked)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="flex items-center gap-2 border-b px-3 py-2 md:gap-3 md:px-4 md:py-2.5">
      {!isGuest && (
        <Button variant="ghost" size="icon-sm" onClick={handleBack}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} size={18} />
        </Button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 md:gap-2">
          {!isGuest && project && (
            <>
              <span
                className="hidden cursor-pointer text-xs text-muted-foreground hover:text-foreground truncate md:inline"
                onClick={() => navigate(`/projects/${project.name}`)}
              >
                {project.project_name}
              </span>
              <span className="hidden text-xs text-muted-foreground md:inline">/</span>
            </>
          )}
          <span className="text-xs font-medium truncate md:text-sm">{fileName}</span>
          {category && <Badge variant="outline" className="hidden shrink-0 text-[10px] md:inline-flex">{category}</Badge>}
          {isGuest && (
            <Badge variant="secondary" className="text-[10px] shrink-0">Guest</Badge>
          )}
        </div>
      </div>

      {/* Share button — auth users only */}
      {!isGuest && (
        <Popover>
          <PopoverTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
            <HugeiconsIcon icon={Link01Icon} strokeWidth={2} data-icon="inline-start" size={16} />
            <span className="hidden md:inline">Share</span>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="public-review-toggle" className="text-sm font-medium">
                  Public review link
                </Label>
                <Switch
                  id="public-review-toggle"
                  checked={isPublicReview}
                  onCheckedChange={handleToggle}
                  disabled={toggling}
                />
              </div>
              {isPublicReview && shareUrl && (
                <div className="flex items-center gap-2">
                  <Input
                    value={shareUrl}
                    readOnly
                    className="text-xs"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button variant="outline" size="icon-sm" onClick={handleCopy}>
                    <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} size={14} />
                  </Button>
                </div>
              )}
              {isPublicReview && !shareUrl && (
                <p className="text-xs text-muted-foreground">Generating link...</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Transcribe button — auth users only */}
      {!isGuest && (
        <>
          {transcriptionStatus === "Processing" ? (
            <Button variant="outline" size="sm" onClick={onOpenTranscription}>
              <Spinner className="size-3.5" />
              <span className="hidden md:inline ml-1">Transcribing...</span>
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="icon-sm"
                className="md:hidden"
                onClick={onOpenTranscription}
                title={transcriptionStatus === "Complete" ? "View transcription" : "Transcribe video"}
              >
                <HugeiconsIcon icon={SubtitleIcon} strokeWidth={2} size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="hidden md:inline-flex"
                onClick={onOpenTranscription}
              >
                <HugeiconsIcon icon={SubtitleIcon} strokeWidth={2} data-icon="inline-start" size={16} />
                {transcriptionStatus === "Complete" ? "Transcript" : "Transcribe"}
              </Button>
            </>
          )}
        </>
      )}

      <Button
        variant="outline"
        size="icon-sm"
        className="md:hidden"
        onClick={() => downloadOne(assetName, fileName)}
        disabled={isDownloading}
      >
        <HugeiconsIcon icon={Download04Icon} strokeWidth={2} size={16} />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="hidden md:inline-flex"
        onClick={() => downloadOne(assetName, fileName)}
        disabled={isDownloading}
      >
        <HugeiconsIcon icon={Download04Icon} strokeWidth={2} data-icon="inline-start" size={16} />
        Download
      </Button>
    </div>
  )
}
