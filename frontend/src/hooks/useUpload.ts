import { useState, useCallback, useRef } from "react"
import { useFrappePostCall } from "frappe-react-sdk"

export type FileUploadStatus = "pending" | "uploading" | "confirming" | "done" | "error" | "cancelled"

export interface FileUploadItem {
  id: string
  file: File
  displayName: string
  status: FileUploadStatus
  progress: number
  error?: string
  assetName?: string
}

const MAX_CONCURRENT = 2

export function useUpload(options?: {
  project?: string
  category?: string
  folder?: string
  onAllComplete?: () => void
}) {
  const [files, setFiles] = useState<FileUploadItem[]>([])
  const activeCount = useRef(0)
  const queueRef = useRef<FileUploadItem[]>([])
  const xhrMap = useRef<Map<string, XMLHttpRequest>>(new Map())

  const { call: getUploadUrl } = useFrappePostCall("vms.api.get_upload_url")
  const { call: confirmUpload } = useFrappePostCall("vms.api.confirm_upload")
  const { call: failUpload } = useFrappePostCall("vms.api.fail_upload")

  const updateFile = useCallback(
    (id: string, update: Partial<FileUploadItem>) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...update } : f))
      )
    },
    []
  )

  const processNext = useCallback(() => {
    if (activeCount.current >= MAX_CONCURRENT) return
    const next = queueRef.current.shift()
    if (!next) {
      // Check if everything is done
      if (activeCount.current === 0) {
        options?.onAllComplete?.()
      }
      return
    }
    activeCount.current++
    uploadFile(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const uploadFile = useCallback(
    async (item: FileUploadItem) => {
      let assetName: string | undefined
      try {
        // Step 1: Get presigned URL
        updateFile(item.id, { status: "uploading", progress: 0 })

        const res = await getUploadUrl({
          file_name: item.displayName,
          content_type: item.file.type || "application/octet-stream",
          project: options?.project || undefined,
          category: options?.category || "Source",
          folder: options?.folder || undefined,
        })

        const { upload_url, asset_name } = res.message as {
          upload_url: string
          r2_key: string
          asset_name: string
        }

        assetName = asset_name
        updateFile(item.id, { assetName: asset_name })

        // Step 2: Upload to R2 via XHR with progress
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhrMap.current.set(item.id, xhr)
          xhr.open("PUT", upload_url)
          xhr.setRequestHeader(
            "Content-Type",
            item.file.type || "application/octet-stream"
          )

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100)
              updateFile(item.id, { progress: pct })
            }
          }

          xhr.onload = () => {
            xhrMap.current.delete(item.id)
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`))
            }
          }

          xhr.onerror = () => {
            xhrMap.current.delete(item.id)
            reject(new Error("Network error during upload"))
          }
          xhr.onabort = () => {
            xhrMap.current.delete(item.id)
            reject(new DOMException("Upload cancelled", "AbortError"))
          }
          xhr.send(item.file)
        })

        // Step 3: Confirm upload
        updateFile(item.id, { status: "confirming", progress: 100 })
        await confirmUpload({
          asset_name,
          file_size: item.file.size,
        })

        updateFile(item.id, { status: "done" })
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") {
          updateFile(item.id, { status: "cancelled" })
        } else {
          const message =
            e instanceof Error ? e.message : "Upload failed"
          updateFile(item.id, { status: "error", error: message })
        }
        // Clean up the backend asset record if it was created
        if (assetName) {
          failUpload({ asset_name: assetName }).catch(() => {})
        }
      } finally {
        activeCount.current--
        processNext()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options?.project, options?.category, options?.folder]
  )

  const retryFile = useCallback(
    (id: string) => {
      setFiles((prev) => {
        const file = prev.find((f) => f.id === id)
        if (!file || file.status !== "error") return prev

        const retryItem: FileUploadItem = {
          ...file,
          status: "pending",
          progress: 0,
          error: undefined,
          assetName: undefined,
        }

        queueRef.current.push(retryItem)
        // Kick off processing
        for (let i = 0; i < MAX_CONCURRENT; i++) {
          processNext()
        }

        return prev.map((f) => (f.id === id ? retryItem : f))
      })
    },
    [processNext]
  )

  const cancelFile = useCallback(
    (id: string) => {
      // If it's still in the queue (pending), just remove it
      const queueIndex = queueRef.current.findIndex((item) => item.id === id)
      if (queueIndex !== -1) {
        queueRef.current.splice(queueIndex, 1)
        updateFile(id, { status: "cancelled" })
        return
      }

      // If it's actively uploading, abort the XHR
      const xhr = xhrMap.current.get(id)
      if (xhr) {
        xhr.abort()
      }
    },
    [updateFile]
  )

  const addFiles = useCallback(
    (newFiles: File[], nameOverrides?: Map<File, string>) => {
      const items: FileUploadItem[] = newFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        displayName: nameOverrides?.get(file) ?? file.name,
        status: "pending" as const,
        progress: 0,
      }))

      setFiles((prev) => [...prev, ...items])
      queueRef.current.push(...items)

      // Kick off processing
      for (let i = 0; i < MAX_CONCURRENT; i++) {
        processNext()
      }
    },
    [processNext]
  )

  const reset = useCallback(() => {
    setFiles([])
    queueRef.current = []
    activeCount.current = 0
  }, [])

  const isUploading = files.some(
    (f) => f.status === "uploading" || f.status === "confirming" || f.status === "pending"
  )

  return { files, addFiles, cancelFile, retryFile, reset, isUploading }
}
