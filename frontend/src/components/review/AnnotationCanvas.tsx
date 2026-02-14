import { useRef, useEffect, useCallback } from "react"
import { useReviewContext } from "@/hooks/useReviewContext"

interface AnnotationCanvasProps {
  videoContainerRef: React.RefObject<HTMLDivElement | null>
  isActive: boolean
  readOnly?: boolean
  annotationData?: string | null
}

export function AnnotationCanvas({
  videoContainerRef,
  isActive,
  readOnly = false,
  annotationData,
}: AnnotationCanvasProps) {
  const { fabricCanvas } = useReviewContext()
  const canvasWrapperRef = useRef<HTMLDivElement>(null)
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const initializedRef = useRef(false)

  const syncSize = useCallback(() => {
    const container = videoContainerRef.current
    const canvas = fabricCanvas.canvasRef.current
    if (!container || !canvas) return

    const rect = container.getBoundingClientRect()
    const w = Math.floor(rect.width)
    const h = Math.floor(rect.height)

    if (canvas.width !== w || canvas.height !== h) {
      canvas.setDimensions({ width: w, height: h })
      canvas.requestRenderAll()
    }
  }, [videoContainerRef, fabricCanvas.canvasRef])

  // Initialize / dispose canvas
  useEffect(() => {
    if (!isActive || !canvasElRef.current) {
      if (initializedRef.current) {
        fabricCanvas.disposeCanvas()
        initializedRef.current = false
      }
      return
    }

    const container = videoContainerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    fabricCanvas.initCanvas(canvasElRef.current, Math.floor(rect.width), Math.floor(rect.height))
    initializedRef.current = true

    // Load annotation data for replay
    if (readOnly && annotationData) {
      fabricCanvas.loadAnnotationData(annotationData, Math.floor(rect.width), Math.floor(rect.height))
    }

    return () => {
      fabricCanvas.disposeCanvas()
      initializedRef.current = false
    }
    // Only re-init when isActive or annotationData changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, annotationData])

  // Resize observer
  useEffect(() => {
    if (!isActive) return
    const container = videoContainerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      syncSize()
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [isActive, videoContainerRef, syncSize])

  if (!isActive) return null

  return (
    <div
      ref={canvasWrapperRef}
      className="absolute inset-0 z-10"
      style={{ pointerEvents: readOnly ? "none" : "auto" }}
    >
      <canvas ref={canvasElRef} className="absolute inset-0" />
    </div>
  )
}
