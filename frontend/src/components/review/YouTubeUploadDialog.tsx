import { useState } from "react"
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface YouTubeUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetName: string
  fileName: string
  uploadStatus: string
  uploadStage: string
  uploadPercent: number
  uploadError: string
  uploadVideoUrl: string
  onUploadStarted: () => void
}

export function YouTubeUploadDialog({
  open,
  onOpenChange,
  assetName,
  fileName,
  uploadStatus,
  uploadStage,
  uploadPercent,
  uploadError,
  uploadVideoUrl,
  onUploadStarted,
}: YouTubeUploadDialogProps) {
  const [title, setTitle] = useState(fileName.replace(/\.[^/.]+$/, ""))
  const [description, setDescription] = useState("")
  const [privacyStatus, setPrivacyStatus] = useState("unlisted")

  const { data: statusData } = useFrappeGetCall<{
    message: { connected: boolean; channel_name: string }
  }>("vms.youtube.get_youtube_status", undefined, "youtube-status-check", {
    revalidateOnFocus: false,
  })

  const { call: callUpload, loading: uploading } = useFrappePostCall(
    "vms.youtube.upload_to_youtube"
  )

  const isConnected = statusData?.message?.connected
  const isInProgress = uploadStatus === "Queued" || uploadStatus === "Uploading"
  const isComplete = uploadStatus === "Complete"
  const isError = uploadStatus === "Error"

  const handleUpload = async () => {
    if (!title.trim()) {
      toast.error("Title is required")
      return
    }

    try {
      await callUpload({
        asset_name: assetName,
        title: title.trim(),
        description: description.trim(),
        privacy_status: privacyStatus,
      })
      onUploadStarted()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to start upload"
      toast.error(message)
    }
  }

  const stageLabel = uploadStage === "downloading"
    ? "Downloading from storage..."
    : uploadStage === "uploading"
      ? "Uploading to YouTube..."
      : uploadStage === "queued"
        ? "Queued, waiting to start..."
        : "Processing..."

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isInProgress) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => { if (isInProgress) e.preventDefault() }}>
        <DialogHeader>
          <DialogTitle>Upload to YouTube</DialogTitle>
          <DialogDescription>
            {isConnected
              ? `Uploading to ${statusData?.message?.channel_name || "YouTube"}`
              : "YouTube is not connected"}
          </DialogDescription>
        </DialogHeader>

        {isConnected === false ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Connect your YouTube account in Settings to upload videos.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                window.dispatchEvent(
                  new CustomEvent("open-settings", { detail: { tab: "youtube" } })
                )
              }}
            >
              Open Settings
            </Button>
          </div>
        ) : isInProgress ? (
          <div className="py-4 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{stageLabel}</span>
                <span>{uploadPercent}%</span>
              </div>
              <Progress value={uploadPercent} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              You can close this dialog — the upload will continue in the background.
            </p>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : isComplete ? (
          <div className="py-4 space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <div className="size-2 rounded-full bg-green-500 shrink-0" />
              <p className="text-sm font-medium">Upload complete</p>
            </div>
            <DialogFooter>
              {uploadVideoUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={uploadVideoUrl} target="_blank" rel="noopener noreferrer">
                    View on YouTube
                  </a>
                </Button>
              )}
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : isError ? (
          <div className="py-4 space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <div className="size-2 rounded-full bg-destructive shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Upload failed</p>
                {uploadError && (
                  <p className="text-xs text-muted-foreground truncate">{uploadError}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button size="sm" onClick={handleUpload} disabled={uploading}>
                Retry
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="yt-title" className="text-xs">
                  Title
                </Label>
                <Input
                  id="yt-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="yt-description" className="text-xs">
                  Description
                </Label>
                <Textarea
                  id="yt-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="yt-privacy" className="text-xs">
                  Privacy
                </Label>
                <Select value={privacyStatus} onValueChange={setPrivacyStatus}>
                  <SelectTrigger id="yt-privacy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlisted">Unlisted</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? "Starting..." : "Upload"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
