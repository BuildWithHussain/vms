import { useState } from "react"
import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  Download04Icon,
  Link01Icon,
  Copy01Icon,
  SubtitleIcon,
  Scissor01Icon,
  GitForkIcon,
  Video01Icon,
  YoutubeIcon,
  Layers01Icon,
  Settings05Icon,
  Share08Icon,
} from "@hugeicons/core-free-icons"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { useDownload } from "@/hooks/useDownload"
import { useReviewContext } from "@/hooks/useReviewContext"
import { toast } from "sonner"

interface ReviewHeaderProps {
  assetName: string
  fileName: string
  fileType?: string
  category?: string
  project?: { name: string; project_name: string } | null
  isPublicReview?: boolean
  reviewToken?: string | null
  onTogglePublicReview?: (enable: boolean) => Promise<void>
  transcriptionStatus?: string
  onTranscribe?: () => Promise<void>
  isTranscribing?: boolean
  onOpenTranscription?: () => void
  assetStatus?: string
  splitProgress?: { stage: string; current: number; total: number } | null
  onOpenSplit?: () => void
  splitFrom?: { name: string; file_name: string } | null
  splitParts?: { name: string; file_name: string }[] | null
  proxyStatus?: string
  onGenerateProxy?: () => Promise<void>
  isGeneratingProxy?: boolean
  youtubeUploadStatus?: string
  youtubeVideoUrl?: string
  onOpenYouTubeUpload?: () => void
  onResetYouTubeUpload?: () => void
  version?: number
  onOpenVersions?: () => void
}

export function ReviewHeader({
  assetName,
  fileName,
  fileType,
  category,
  project,
  isPublicReview = false,
  reviewToken,
  onTogglePublicReview,
  transcriptionStatus,
  onTranscribe,
  isTranscribing,
  onOpenTranscription,
  assetStatus,
  splitProgress,
  onOpenSplit,
  splitFrom,
  splitParts,
  proxyStatus,
  onGenerateProxy,
  isGeneratingProxy,
  youtubeUploadStatus,
  youtubeVideoUrl,
  onOpenYouTubeUpload,
  onResetYouTubeUpload,
  version,
  onOpenVersions,
}: ReviewHeaderProps) {
  const navigate = useNavigate()
  const { isGuest, token } = useReviewContext()
  const { downloadOne, isDownloading } = useDownload(token)
  const [toggling, setToggling] = useState(false)
  const [publicLinkOpen, setPublicLinkOpen] = useState(false)
  const isVideo = !fileType || fileType.startsWith("video/") || fileType.startsWith("audio/")

  const handleBack = () => {
    if (project) {
      navigate(`/projects/${project.name}`)
    } else {
      navigate("/uncategorised")
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
          {splitFrom && (
            <Badge
              variant="secondary"
              className="hidden shrink-0 cursor-pointer text-[10px] gap-1 md:inline-flex"
              onClick={() => navigate(`/review/${splitFrom.name}`)}
            >
              <HugeiconsIcon icon={GitForkIcon} size={10} />
              Split from {splitFrom.file_name}
            </Badge>
          )}
          {splitParts && splitParts.length > 0 && (
            <Popover>
              <PopoverTrigger>
                <Badge variant="secondary" className="hidden shrink-0 cursor-pointer text-[10px] gap-1 md:inline-flex">
                  <HugeiconsIcon icon={GitForkIcon} size={10} />
                  {splitParts.length} {splitParts.length === 1 ? "part" : "parts"}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Split parts</p>
                  {splitParts.map((part) => (
                    <div
                      key={part.name}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-muted"
                      onClick={() => navigate(`/review/${part.name}`)}
                    >
                      <span className="truncate">{part.file_name}</span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {isGuest && (
            <Badge variant="secondary" className="text-[10px] shrink-0">Guest</Badge>
          )}
        </div>
      </div>

      {/* Versions button — auth users only, remains as-is */}
      {!isGuest && onOpenVersions && (
        <>
          <Button
            variant="outline"
            size="icon-sm"
            className="md:hidden"
            onClick={onOpenVersions}
            title="Version history"
          >
            <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} size={16} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
            onClick={onOpenVersions}
          >
            <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} data-icon="inline-start" size={16} />
            {version && version > 1 ? `v${version}` : "Versions"}
          </Button>
        </>
      )}

      {/* Tools dropdown — auth users only */}
      {!isGuest && isVideo && (
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
            <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} data-icon="inline-start" size={16} />
            <span className="hidden md:inline">Tools</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Transcribe */}
            {transcriptionStatus === "Processing" ? (
              <DropdownMenuItem disabled>
                <Spinner className="size-3.5" />
                Transcribing...
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onOpenTranscription}>
                <HugeiconsIcon icon={SubtitleIcon} strokeWidth={2} size={16} />
                {transcriptionStatus === "Complete" ? "Transcript" : "Transcribe"}
              </DropdownMenuItem>
            )}

            {/* Split */}
            {assetStatus === "Processing" ? (
              <DropdownMenuItem disabled>
                <Spinner className="size-3.5" />
                {splitProgress?.stage === "downloading"
                  ? "Downloading..."
                  : splitProgress?.stage === "splitting"
                    ? "Splitting..."
                    : splitProgress?.stage === "uploading"
                      ? `Uploading ${splitProgress.current}/${splitProgress.total}...`
                      : "Splitting..."}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onOpenSplit}>
                <HugeiconsIcon icon={Scissor01Icon} strokeWidth={2} size={16} />
                Split
              </DropdownMenuItem>
            )}

            {/* Generate Proxy */}
            {!proxyStatus && (
              <DropdownMenuItem
                onClick={onGenerateProxy}
                disabled={isGeneratingProxy}
              >
                <HugeiconsIcon icon={Video01Icon} strokeWidth={2} size={16} />
                Generate Proxy
              </DropdownMenuItem>
            )}
            {proxyStatus === "Processing" && (
              <DropdownMenuItem disabled>
                <Spinner className="size-3.5" />
                Generating proxy...
              </DropdownMenuItem>
            )}
            {proxyStatus === "Ready" && (
              <DropdownMenuItem disabled>
                <HugeiconsIcon icon={Video01Icon} strokeWidth={2} size={16} />
                Proxy ready
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Share dropdown — auth users only */}
      {!isGuest && (
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
            <HugeiconsIcon icon={Share08Icon} strokeWidth={2} data-icon="inline-start" size={16} />
            <span className="hidden md:inline">Share</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Download */}
            <DropdownMenuItem
              onClick={() => downloadOne(assetName, fileName)}
              disabled={isDownloading}
            >
              <HugeiconsIcon icon={Download04Icon} strokeWidth={2} size={16} />
              Download
            </DropdownMenuItem>

            {/* Public Link */}
            <DropdownMenuItem onClick={() => setPublicLinkOpen(true)}>
              <HugeiconsIcon icon={Link01Icon} strokeWidth={2} size={16} />
              Public Link
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* YouTube */}
            {isVideo && (() => {
              if (youtubeUploadStatus === "Queued" || youtubeUploadStatus === "Uploading") {
                return (
                  <DropdownMenuItem disabled>
                    <Spinner className="size-3.5" />
                    {youtubeUploadStatus === "Queued" ? "Queued..." : "Uploading..."}
                  </DropdownMenuItem>
                )
              }
              if (youtubeUploadStatus === "Complete" && youtubeVideoUrl) {
                return (
                  <>
                    <DropdownMenuItem onClick={() => window.open(youtubeVideoUrl, "_blank")}>
                      <HugeiconsIcon icon={YoutubeIcon} strokeWidth={2} size={16} />
                      View on YouTube
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onResetYouTubeUpload}>
                      <HugeiconsIcon icon={YoutubeIcon} strokeWidth={2} size={16} />
                      Re-upload to YouTube
                    </DropdownMenuItem>
                  </>
                )
              }
              if (youtubeUploadStatus === "Error") {
                return (
                  <DropdownMenuItem onClick={onOpenYouTubeUpload}>
                    <HugeiconsIcon icon={YoutubeIcon} strokeWidth={2} size={16} />
                    Retry YouTube Upload
                  </DropdownMenuItem>
                )
              }
              return (
                <DropdownMenuItem onClick={onOpenYouTubeUpload}>
                  <HugeiconsIcon icon={YoutubeIcon} strokeWidth={2} size={16} />
                  YouTube
                </DropdownMenuItem>
              )
            })()}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Guest download button */}
      {isGuest && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadOne(assetName, fileName)}
          disabled={isDownloading}
        >
          <HugeiconsIcon icon={Download04Icon} strokeWidth={2} data-icon="inline-start" size={16} />
          Download
        </Button>
      )}

      {/* Public Link Dialog */}
      <Dialog open={publicLinkOpen} onOpenChange={setPublicLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Public Review Link</DialogTitle>
            <DialogDescription>
              Share this link to allow anyone to view and comment on this asset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="public-review-toggle" className="text-sm font-medium">
                Enable public link
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
        </DialogContent>
      </Dialog>
    </div>
  )
}
