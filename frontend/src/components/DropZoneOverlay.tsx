import { useState, useCallback, useRef } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon } from "@hugeicons/core-free-icons"

interface DropZoneOverlayProps {
  children: React.ReactNode
  onDrop: (files: File[]) => void
  disabled?: boolean
}

export function DropZoneOverlay({ children, onDrop, disabled }: DropZoneOverlayProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const isFileDrag = useCallback((e: React.DragEvent) => {
    return e.dataTransfer.types.includes("Files") &&
      !e.dataTransfer.types.includes("application/vms-assets")
  }, [])

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (disabled) return
      dragCounter.current++
      setIsDragging(true)
    },
    [disabled, isFileDrag]
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!isDragging && dragCounter.current === 0) return
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current--
      if (dragCounter.current === 0) {
        setIsDragging(false)
      }
    },
    [isDragging]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
  }, [isFileDrag])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isDragging && !isFileDrag(e)) return
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)
      if (disabled) return
      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length > 0) {
        onDrop(droppedFiles)
      }
    },
    [disabled, onDrop, isDragging, isFileDrag]
  )

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 text-primary">
            <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.5} className="size-12" />
            <span className="text-sm font-medium">Drop files to upload</span>
          </div>
        </div>
      )}
    </div>
  )
}
