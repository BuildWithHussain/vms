import { useEffect, useState } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type MediaType = "video" | "audio" | "image"

function getMediaType(fileType?: string): MediaType {
  if (!fileType) return "video"
  if (fileType.startsWith("image/")) return "image"
  if (fileType.startsWith("audio/")) return "audio"
  return "video"
}

interface MediaPlayerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetName: string | null
  fileName?: string
  fileType?: string
}

export function MediaPlayerDialog({
  open,
  onOpenChange,
  assetName,
  fileName,
  fileType,
}: MediaPlayerDialogProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { call: getViewUrl } = useFrappePostCall("vms.api.get_view_url")

  const mediaType = getMediaType(fileType)

  useEffect(() => {
    if (!open || !assetName) {
      setMediaUrl(null)
      setError(null)
      return
    }

    let cancelled = false

    async function fetchUrl() {
      try {
        const res = await getViewUrl({ asset_name: assetName })
        if (!cancelled) {
          setMediaUrl((res.message as { url: string }).url)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load media")
        }
      }
    }

    fetchUrl()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assetName])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={mediaType === "audio" ? "sm:max-w-lg" : "sm:max-w-4xl"}>
        <DialogHeader>
          <DialogTitle className="truncate">
            {fileName || assetName || "Media Player"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Media playback
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex items-center justify-center rounded-lg bg-muted py-12 text-sm text-destructive">
            {error}
          </div>
        ) : !mediaUrl ? (
          <div className="flex items-center justify-center rounded-lg bg-muted py-12 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : mediaType === "video" ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <video
              src={mediaUrl}
              controls
              autoPlay
              className="h-full w-full"
            />
          </div>
        ) : mediaType === "audio" ? (
          <div className="py-4">
            <audio
              src={mediaUrl}
              controls
              autoPlay
              className="w-full"
            />
          </div>
        ) : (
          <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-lg bg-muted">
            <img
              src={mediaUrl}
              alt={fileName || "Image"}
              className="max-h-[70vh] w-auto object-contain"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
