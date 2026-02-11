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

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (disabled) return
      dragCounter.current++
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragging(true)
      }
    },
    [disabled]
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current--
      if (dragCounter.current === 0) {
        setIsDragging(false)
      }
    },
    []
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
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
    [disabled, onDrop]
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
