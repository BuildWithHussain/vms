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
  onUploadStarted: () => void
}

export function YouTubeUploadDialog({
  open,
  onOpenChange,
  assetName,
  fileName,
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
      toast.success("YouTube upload started")
      onOpenChange(false)
      onUploadStarted()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to start upload"
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
                // Dispatch event to open settings to youtube tab
                window.dispatchEvent(
                  new CustomEvent("open-settings", { detail: { tab: "youtube" } })
                )
              }}
            >
              Open Settings
            </Button>
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
