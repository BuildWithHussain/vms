import { useRef, useEffect, useState, useCallback } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { useReviewContext } from "@/hooks/useReviewContext"
import { AnnotationCanvas } from "./AnnotationCanvas"

interface ImageViewerProps {
  assetName: string
}

export function ImageViewer({ assetName }: ImageViewerProps) {
  const { replayAnnotation, annotationMode, dismissReplay, token } = useReviewContext()

  const containerRef = useRef<HTMLDivElement>(null)
  const imageWrapperRef = useRef<HTMLDivElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { call: getViewUrl } = useFrappePostCall("vms.review_api.get_review_view_url")

  useEffect(() => {
    if (!assetName) return
    const params: Record<string, string> = { asset_name: assetName }
    if (token) params.token = token
    getViewUrl(params).then((res) => {
      setImageUrl(res.message.url)
    })
  }, [assetName, token, getViewUrl])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      el.requestFullscreen()
    }
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const isCanvasActive = annotationMode || !!replayAnnotation

  return (
    <div ref={containerRef} className="flex flex-col overflow-hidden rounded-lg border bg-black md:h-full">
      <div
        ref={imageWrapperRef}
        className="relative flex flex-1 items-center justify-center bg-black min-h-[300px] md:min-h-0"
        onDoubleClick={toggleFullscreen}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Review image"
            className="max-h-full max-w-full object-contain"
            onClick={isCanvasActive ? undefined : () => {}}
            draggable={false}
          />
        ) : (
          <div className="flex items-center justify-center text-muted-foreground text-sm">
            Loading image...
          </div>
        )}
        <AnnotationCanvas
          videoContainerRef={imageWrapperRef}
          isActive={isCanvasActive}
          readOnly={!!replayAnnotation}
          annotationData={replayAnnotation}
        />
      </div>
      {isFullscreen && (
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground/50">
          Double-click to exit fullscreen
        </div>
      )}
    </div>
  )
}
