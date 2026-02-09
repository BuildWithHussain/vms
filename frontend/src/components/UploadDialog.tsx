import { useRef, useState, useCallback } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon, Tick02Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { useUpload, type FileUploadItem } from "@/hooks/useUpload"
import { cn } from "@/lib/utils"

interface UploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: string
  onComplete?: () => void
}

export function UploadDialog({
  open,
  onOpenChange,
  project,
  onComplete,
}: UploadDialogProps) {
  const [category, setCategory] = useState<string>("Source")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { files, addFiles, cancelFile, reset, isUploading } = useUpload({
    project,
    category,
    onAllComplete: () => {
      onComplete?.()
    },
  })

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length > 0) addFiles(droppedFiles)
    },
    [addFiles]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? [])
      if (selected.length > 0) addFiles(selected)
      e.target.value = ""
    },
    [addFiles]
  )

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && !isUploading) {
      reset()
      setCategory("Source")
    }
    if (!isUploading) {
      onOpenChange(nextOpen)
    }
  }

  const allDone = files.length > 0 && files.every((f) => f.status === "done" || f.status === "error" || f.status === "cancelled")

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Assets</DialogTitle>
          <DialogDescription>
            {project
              ? "Upload files to this project."
              : "Upload files to your Inbox."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory} disabled={isUploading}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Source">Source</SelectItem>
                <SelectItem value="Cut">Cut</SelectItem>
                <SelectItem value="Review">Review</SelectItem>
                <SelectItem value="Final">Final</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
              isUploading
                ? "pointer-events-none border-muted opacity-50"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            )}
          >
            <HugeiconsIcon
              icon={CloudUploadIcon}
              strokeWidth={1.5}
              className="size-10 text-muted-foreground"
            />
            <div className="text-sm font-medium">
              Drop files here or click to browse
            </div>
            <div className="text-xs text-muted-foreground">
              Video files (mp4, mov, avi, mkv, webm)
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,audio/*,image/*,.mkv,.avi,.m4v"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {files.map((item) => (
                <FileRow key={item.id} item={item} onCancel={cancelFile} />
              ))}
            </div>
          )}

          {allDone && (
            <div className="flex justify-end">
              <Button onClick={() => handleClose(false)}>Done</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FileRow({ item, onCancel }: { item: FileUploadItem; onCancel: (id: string) => void }) {
  const sizeMB = (item.file.size / 1024 / 1024).toFixed(1)
  const canCancel = item.status === "pending" || item.status === "uploading"

  return (
    <div className={cn("rounded-lg border p-3 space-y-2", item.status === "cancelled" && "opacity-50")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.file.name}</div>
          <div className="text-xs text-muted-foreground">{sizeMB} MB</div>
        </div>
        {canCancel ? (
          <button
            type="button"
            onClick={() => onCancel(item.id)}
            className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Cancel upload"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
          </button>
        ) : (
          <StatusIcon status={item.status} />
        )}
      </div>
      {(item.status === "uploading" || item.status === "confirming") && (
        <Progress value={item.progress}>
          <ProgressLabel className="sr-only">Uploading</ProgressLabel>
          <ProgressValue />
        </Progress>
      )}
      {item.status === "error" && (
        <div className="text-xs text-destructive">{item.error}</div>
      )}
      {item.status === "cancelled" && (
        <div className="text-xs text-muted-foreground">Cancelled</div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: FileUploadItem["status"] }) {
  switch (status) {
    case "done":
      return (
        <div className="flex size-6 items-center justify-center rounded-full bg-green-100 text-green-600">
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4" />
        </div>
      )
    case "error":
      return (
        <div className="flex size-6 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
        </div>
      )
    case "uploading":
    case "confirming":
      return (
        <div className="size-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
      )
    default:
      return (
        <div className="size-5 rounded-full border-2 border-muted" />
      )
  }
}
