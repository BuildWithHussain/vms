import { useEffect, useState } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { VMSAsset } from "@/types"

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
  siblings?: VMSAsset[]
  onNavigate?: (asset: VMSAsset) => void
}

export function MediaPlayerDialog({
  open,
  onOpenChange,
  assetName,
  fileName,
  fileType,
  siblings,
  onNavigate,
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

  useEffect(() => {
    if (!open || !onNavigate || !siblings || siblings.length < 2 || !assetName) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return
      }
      const index = siblings.findIndex((a) => a.name === assetName)
      if (index === -1) return
      const nextIndex = e.key === "ArrowLeft"
        ? (index - 1 + siblings.length) % siblings.length
        : (index + 1) % siblings.length
      const next = siblings[nextIndex]
      if (next && next.name !== assetName) {
        e.preventDefault()
        onNavigate(next)
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [open, assetName, siblings, onNavigate])

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
          <div className="flex items-center justify-center rounded-lg bg-muted py-12">
            <Spinner className="size-6" />
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
