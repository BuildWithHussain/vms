import { useState, useCallback, useRef, useEffect } from "react"
import { useFrappePostCall, useFrappeGetCall, useFrappeEventListener } from "frappe-react-sdk"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Upload04Icon,
  Download04Icon,
  FileVideoIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ArrowReloadHorizontalIcon,
} from "@hugeicons/core-free-icons"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

interface CompressJob {
  name: string
  original_file_name: string
  original_size: number
  compressed_size: number
  status: "Queued" | "Uploading" | "Processing" | "Complete" | "Error"
  progress: number
  creation: string
}

interface CompressStatus {
  job_name: string
  status: string
  progress: number
  original_file_name: string
  original_size: number
  compressed_size: number
  compressed_file_name: string
  error_message: string
  download_url?: string
}

export function ToolsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center border-b px-6">
        <h1 className="text-lg font-semibold">Tools</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <Tabs defaultValue="compress">
          <TabsList>
            <TabsTrigger value="compress">Compress</TabsTrigger>
          </TabsList>
          <TabsContent value="compress">
            <CompressTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function CompressTab() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [activeJob, setActiveJob] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<CompressStatus | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const { call: getUploadUrl } = useFrappePostCall("vms.tools_api.get_tool_upload_url")
  const { call: startCompression } = useFrappePostCall("vms.tools_api.start_compression")
  const { call: getCompressDownloadUrl } = useFrappePostCall("vms.tools_api.get_compress_download_url")
  const [downloadingJob, setDownloadingJob] = useState<string | null>(null)

  // Fetch job list
  const { data: jobsData, isLoading: jobsLoading, mutate: mutateJobs } = useFrappeGetCall<{
    message: { jobs: CompressJob[]; total: number }
  }>("vms.tools_api.get_compress_jobs", { page: 1, page_size: 10 })

  // Poll active job status
  const { data: statusData, mutate: mutateStatus } = useFrappeGetCall<{
    message: CompressStatus
  }>(
    "vms.tools_api.get_compress_status",
    activeJob ? { job_name: activeJob } : undefined,
    activeJob ? undefined : null,
    {}
  )

  // Listen for realtime progress updates
  useFrappeEventListener<{
    job_name: string
    status: string
    progress: number
    compressed_size: number
    error_message: string
  }>("compress_progress", useCallback((data) => {
    if (data.job_name === activeJob) {
      setJobStatus((prev) => prev ? { ...prev, ...data } : null)
      if (data.status === "Complete" || data.status === "Error") {
        mutateStatus()
        mutateJobs()
        if (data.status === "Complete") {
          toast.success("Compression complete!")
        } else {
          toast.error("Compression failed")
        }
      }
    }
  }, [activeJob, mutateStatus, mutateJobs]))

  // Merge polled status into jobStatus
  // Sync download_url from API refetch into jobStatus (socket events don't include it)
  useEffect(() => {
    if (statusData?.message?.download_url && jobStatus && !jobStatus.download_url) {
      setJobStatus((prev) => prev ? { ...prev, ...statusData.message } : null)
    }
  }, [statusData?.message?.download_url]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentStatus = jobStatus || statusData?.message

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) setFile(selected)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped && dropped.type.startsWith("video/")) {
      setFile(dropped)
    }
  }

  const handleCompress = async () => {
    if (!file) return

    try {
      setUploading(true)
      setUploadProgress(0)

      // 1. Get presigned upload URL
      const urlRes = await getUploadUrl({
        file_name: file.name,
        content_type: file.type || "video/mp4",
      })
      const { upload_url, r2_key } = urlRes.message

      // 2. Upload file to R2 via XHR
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr
        xhr.open("PUT", upload_url)
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4")

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          xhrRef.current = null
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        }

        xhr.onerror = () => {
          xhrRef.current = null
          reject(new Error("Network error during upload"))
        }

        xhr.send(file)
      })

      // 3. Start compression job
      const jobRes = await startCompression({
        r2_key,
        file_name: file.name,
        file_size: file.size,
      })

      const jobName = jobRes.message.job_name
      setActiveJob(jobName)
      setJobStatus({
        job_name: jobName,
        status: "Queued",
        progress: 0,
        original_file_name: file.name,
        original_size: file.size,
        compressed_size: 0,
        compressed_file_name: "",
        error_message: "",
      })
      setFile(null)
      setUploading(false)
      setUploadProgress(0)
      mutateJobs()
      toast.success("Compression started!")
    } catch (err) {
      setUploading(false)
      setUploadProgress(0)
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }

  const handleDownload = () => {
    if (currentStatus?.download_url) {
      window.open(currentStatus.download_url, "_blank")
    }
  }

  const handleReset = () => {
    setActiveJob(null)
    setJobStatus(null)
    setFile(null)
  }

  const handleDownloadJob = async (jobName: string) => {
    try {
      setDownloadingJob(jobName)
      const res = await getCompressDownloadUrl({ job_name: jobName })
      const { url, file_name } = res.message as { url: string; file_name: string }
      const a = document.createElement("a")
      a.href = url
      a.download = file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      toast.error("Failed to download compressed file")
    } finally {
      setDownloadingJob(null)
    }
  }

  const jobs = jobsData?.message?.jobs ?? []
  const isProcessing = activeJob && currentStatus && !["Complete", "Error"].includes(currentStatus.status)

  return (
    <div className="space-y-6 pt-4">
      {/* Upload / Active Job Section */}
      <div className="rounded-lg border p-6">
        {!activeJob ? (
          // File selection + upload
          <>
            <div
              className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-muted-foreground/50"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <HugeiconsIcon icon={FileVideoIcon} strokeWidth={2} className="size-10 text-muted-foreground" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} className="size-10" />
                  <p className="text-sm font-medium">Drop a video file here or click to browse</p>
                  <p className="text-xs">Supports MP4, MOV, MKV, AVI, WebM</p>
                </div>
              )}
            </div>

            {uploading && (
              <div className="mt-4">
                <Progress value={uploadProgress}>
                  <ProgressLabel>Uploading...</ProgressLabel>
                  <ProgressValue />
                </Progress>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button onClick={handleCompress} disabled={!file || uploading}>
                {uploading ? "Uploading..." : "Compress"}
              </Button>
            </div>
          </>
        ) : (
          // Active job status
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HugeiconsIcon icon={FileVideoIcon} strokeWidth={2} className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{currentStatus?.original_file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Original: {formatBytes(currentStatus?.original_size ?? 0)}
                  </p>
                </div>
              </div>
              <StatusBadge status={currentStatus?.status ?? "Queued"} />
            </div>

            {isProcessing && (
              <Progress value={currentStatus?.progress ?? 0}>
                <ProgressLabel>Compressing...</ProgressLabel>
                <ProgressValue />
              </Progress>
            )}

            {currentStatus?.status === "Complete" && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Compression complete</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(currentStatus.original_size)} → {formatBytes(currentStatus.compressed_size)}
                    {currentStatus.original_size > 0 && (
                      <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                        ({Math.round((1 - currentStatus.compressed_size / currentStatus.original_size) * 100)}% smaller)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <HugeiconsIcon icon={ArrowReloadHorizontalIcon} strokeWidth={2} className="mr-1 size-4" />
                    New
                  </Button>
                  <Button size="sm" onClick={handleDownload}>
                    <HugeiconsIcon icon={Download04Icon} strokeWidth={2} className="mr-1 size-4" />
                    Download
                  </Button>
                </div>
              </div>
            )}

            {currentStatus?.status === "Error" && (
              <div className="space-y-3">
                <div className="rounded-lg bg-destructive/10 p-4">
                  <p className="text-sm text-destructive">{currentStatus.error_message || "Compression failed"}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Try Again
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Job History */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">Recent Jobs</h3>
        {jobsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No compression jobs yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Original</TableHead>
                <TableHead>Compressed</TableHead>
                <TableHead>Reduction</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.name}>
                  <TableCell className="max-w-[200px] truncate text-sm font-medium">
                    {job.original_file_name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatBytes(job.original_size)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.compressed_size ? formatBytes(job.compressed_size) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {job.status === "Complete" && job.original_size > 0 ? (
                      <span className="text-green-600 dark:text-green-400">
                        {Math.round((1 - job.compressed_size / job.original_size) * 100)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(job.creation), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    {job.status === "Complete" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={downloadingJob === job.name}
                        onClick={() => handleDownloadJob(job.name)}
                        title="Download compressed file"
                      >
                        <HugeiconsIcon icon={Download04Icon} strokeWidth={2} className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "Complete":
      return (
        <Badge variant="secondary" className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-3" />
          Complete
        </Badge>
      )
    case "Error":
      return (
        <Badge variant="destructive" className="gap-1">
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
          Error
        </Badge>
      )
    case "Processing":
      return (
        <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          Processing
        </Badge>
      )
    case "Uploading":
      return (
        <Badge variant="secondary" className="gap-1">
          Uploading
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="gap-1">
          Queued
        </Badge>
      )
  }
}
