import { useRef, useState, useCallback, useEffect } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CloudUploadIcon,
  Tick02Icon,
  Cancel01Icon,
  AlertCircleIcon,
  RefreshIcon,
  MinusSignIcon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons"
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
import { useUploadContext } from "@/contexts/UploadContext"
import type { FileUploadItem } from "@/hooks/useUpload"
import { cn } from "@/lib/utils"

interface DuplicateFile {
  file: File
  renamedName: string
  action: "rename" | "skip" | "pending"
}

function generateUniqueName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name
  const dotIndex = name.lastIndexOf(".")
  const baseName = dotIndex > 0 ? name.slice(0, dotIndex) : name
  const ext = dotIndex > 0 ? name.slice(dotIndex) : ""
  let counter = 1
  let candidate = `${baseName} (${counter})${ext}`
  while (existingNames.has(candidate)) {
    counter++
    candidate = `${baseName} (${counter})${ext}`
  }
  return candidate
}

export function UploadDialog() {
  const {
    files,
    addFiles,
    cancelFile,
    retryFile,
    isUploading,
    dialogOpen,
    minimized,
    openUpload,
    minimize,
    expand,
    closeUpload,
    dismiss,
    config,
  } = useUploadContext()

  const [category, setCategory] = useState<string>("Footage")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [duplicates, setDuplicates] = useState<DuplicateFile[]>([])
  const [nonDuplicates, setNonDuplicates] = useState<File[]>([])
  const initialFilesProcessed = useRef(false)

  const allDone =
    files.length > 0 &&
    files.every(
      (f) => f.status === "done" || f.status === "error" || f.status === "cancelled",
    )

  const existingSet = new Set(config.existingFileNames ?? [])

  // Process initial files when dialog opens with them (e.g. from page-level drop)
  useEffect(() => {
    if (
      dialogOpen &&
      config.initialFiles &&
      config.initialFiles.length > 0 &&
      !initialFilesProcessed.current
    ) {
      initialFilesProcessed.current = true
      processIncomingFiles(config.initialFiles)
    }
    if (!dialogOpen && !minimized) {
      initialFilesProcessed.current = false
    }
  }, [dialogOpen, config.initialFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset category from config
  useEffect(() => {
    if (config.category) {
      setCategory(config.category)
    }
  }, [config.category])

  const processIncomingFiles = useCallback(
    (incoming: File[]) => {
      if (!config.existingFileNames || config.existingFileNames.length === 0) {
        addFiles(incoming, {
          project: config.project,
          category,
          folder: config.folder,
        })
        return
      }

      // Also include names from files already queued in current session
      const sessionNames = new Set(files.map((f) => f.displayName))
      const allExisting = new Set([...existingSet, ...sessionNames])

      const dupes: DuplicateFile[] = []
      const clean: File[] = []

      for (const file of incoming) {
        if (allExisting.has(file.name)) {
          dupes.push({
            file,
            renamedName: generateUniqueName(file.name, allExisting),
            action: "pending",
          })
        } else {
          clean.push(file)
          allExisting.add(file.name)
        }
      }

      if (dupes.length === 0) {
        addFiles(clean, {
          project: config.project,
          category,
          folder: config.folder,
        })
      } else {
        setNonDuplicates(clean)
        setDuplicates(dupes)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.existingFileNames, config.project, config.folder, files, addFiles, category],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length > 0) processIncomingFiles(droppedFiles)
    },
    [processIncomingFiles],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? [])
      if (selected.length > 0) processIncomingFiles(selected)
      e.target.value = ""
    },
    [processIncomingFiles],
  )

  const updateDuplicateAction = (index: number, action: "rename" | "skip") => {
    setDuplicates((prev) =>
      prev.map((d, i) => (i === index ? { ...d, action } : d)),
    )
  }

  const applyAllDuplicateAction = (action: "rename" | "skip") => {
    setDuplicates((prev) => prev.map((d) => ({ ...d, action })))
  }

  const confirmDuplicateResolution = () => {
    const filesToUpload: File[] = [...nonDuplicates]
    const nameOverrides = new Map<File, string>()

    for (const d of duplicates) {
      if (d.action === "skip") continue
      if (d.action === "rename") {
        filesToUpload.push(d.file)
        nameOverrides.set(d.file, d.renamedName)
      }
    }

    if (filesToUpload.length > 0) {
      addFiles(filesToUpload, {
        nameOverrides: nameOverrides.size > 0 ? nameOverrides : undefined,
        project: config.project,
        category,
        folder: config.folder,
      })
    }

    setDuplicates([])
    setNonDuplicates([])
  }

  const cancelDuplicateResolution = () => {
    setDuplicates([])
    setNonDuplicates([])
  }

  const allDuplicatesResolved =
    duplicates.length > 0 && duplicates.every((d) => d.action !== "pending")

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (isUploading) {
        // During upload, minimize instead of blocking close
        minimize()
        return
      }
      closeUpload()
      setCategory("Footage")
      setDuplicates([])
      setNonDuplicates([])
    } else {
      openUpload()
    }
  }

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col" showCloseButton={!(isUploading || files.length > 0)}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Upload Assets</DialogTitle>
                <DialogDescription>
                  {config.project
                    ? "Upload files to this project."
                    : "Upload files without a project."}
                </DialogDescription>
              </div>
              {(isUploading || files.length > 0) && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={minimize}
                  title="Minimize to corner"
                  className="shrink-0"
                >
                  <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-4" />
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory} disabled={isUploading}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Footage">Footage</SelectItem>
                  <SelectItem value="For Review">For Review</SelectItem>
                  <SelectItem value="Deliverable">Deliverable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duplicate resolution */}
            {duplicates.length > 0 && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                  <HugeiconsIcon
                    icon={AlertCircleIcon}
                    strokeWidth={2}
                    className="size-4"
                  />
                  {duplicates.length === 1
                    ? "1 file already exists"
                    : `${duplicates.length} files already exist`}
                </div>

                <div className="space-y-2">
                  {duplicates.map((d, i) => (
                    <div
                      key={d.file.name}
                      className="flex items-center justify-between gap-2 rounded-md bg-white/60 p-2 dark:bg-white/5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{d.file.name}</div>
                        {d.action === "rename" && (
                          <div className="truncate text-xs text-muted-foreground">
                            → {d.renamedName}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant={d.action === "rename" ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => updateDuplicateAction(i, "rename")}
                        >
                          Rename
                        </Button>
                        <Button
                          variant={d.action === "skip" ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => updateDuplicateAction(i, "skip")}
                        >
                          Skip
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {duplicates.length > 1 && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => applyAllDuplicateAction("rename")}
                        >
                          Rename All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => applyAllDuplicateAction("skip")}
                        >
                          Skip All
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={cancelDuplicateResolution}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!allDuplicatesResolved}
                      onClick={confirmDuplicateResolution}
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
                isUploading || duplicates.length > 0
                  ? "pointer-events-none border-muted opacity-50"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
              )}
            >
              <HugeiconsIcon
                icon={CloudUploadIcon}
                strokeWidth={1.5}
                className="size-10 text-muted-foreground"
              />
              <div className="text-sm font-medium">Drop files here or click to browse</div>
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
              <div className="space-y-2">
                {files.map((item) => (
                  <FileRow
                    key={item.id}
                    item={item}
                    onCancel={cancelFile}
                    onRetry={retryFile}
                  />
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

      {/* Minimized floating widget */}
      {minimized && files.length > 0 && <UploadWidget />}
    </>
  )
}

function UploadWidget() {
  const { files, isUploading, expand, dismiss } = useUploadContext()
  const autoDismissRef = useRef<ReturnType<typeof setTimeout>>()

  const doneCount = files.filter((f) => f.status === "done").length
  const errorCount = files.filter((f) => f.status === "error").length
  const totalCount = files.length
  const allDone = files.every(
    (f) => f.status === "done" || f.status === "error" || f.status === "cancelled",
  )

  const overallProgress =
    totalCount > 0
      ? Math.round(files.reduce((sum, f) => sum + f.progress, 0) / totalCount)
      : 0

  // Auto-dismiss 5s after all uploads finish
  useEffect(() => {
    if (allDone && totalCount > 0) {
      autoDismissRef.current = setTimeout(dismiss, 5000)
      return () => clearTimeout(autoDismissRef.current)
    }
  }, [allDone, totalCount, dismiss])

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="rounded-lg border bg-background shadow-lg">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            {allDone ? (
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3" />
              </div>
            ) : (
              <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-muted border-t-primary" />
            )}
            <span className="truncate text-sm font-medium">
              {allDone
                ? `${doneCount} file${doneCount !== 1 ? "s" : ""} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ""}`
                : `Uploading ${doneCount}/${totalCount}`}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={expand}
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Expand"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="size-4" />
            </button>
            {allDone && (
              <button
                type="button"
                onClick={dismiss}
                className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Dismiss"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
              </button>
            )}
          </div>
        </div>
        {isUploading && (
          <div className="px-3 pb-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FileRow({
  item,
  onCancel,
  onRetry,
}: {
  item: FileUploadItem
  onCancel: (id: string) => void
  onRetry: (id: string) => void
}) {
  const sizeMB = (item.file.size / 1024 / 1024).toFixed(1)
  const canCancel = item.status === "pending" || item.status === "uploading"
  const wasRenamed = item.displayName !== item.file.name

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        item.status === "cancelled" && "opacity-50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.displayName}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{sizeMB} MB</span>
            {wasRenamed && (
              <span className="text-amber-600 dark:text-amber-400">renamed</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {item.status === "error" && (
            <button
              type="button"
              onClick={() => onRetry(item.id)}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Retry upload"
            >
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-4" />
            </button>
          )}
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
      return <div className="size-5 rounded-full border-2 border-muted" />
  }
}
