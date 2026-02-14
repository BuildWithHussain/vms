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
const MAX_PART_RETRIES = 3

interface UploadUrlResponse {
  upload_url?: string
  r2_key: string
  asset_name: string
  multipart: boolean
  upload_id?: string
  part_size?: number
}

/** Upload a single chunk via XHR, returning the ETag from the response. */
function uploadPart(
  url: string,
  blob: Blob,
  onProgress: (loaded: number) => void,
  signal: { cancelled: boolean },
  xhrRef: { current: XMLHttpRequest | null },
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.cancelled) {
      reject(new DOMException("Upload cancelled", "AbortError"))
      return
    }

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    xhr.open("PUT", url)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded)
    }

    xhr.onload = () => {
      xhrRef.current = null
      if (xhr.status >= 200 && xhr.status < 300) {
        const rawEtag = xhr.getResponseHeader("ETag")
        if (!rawEtag) {
          reject(new Error("Server did not return ETag for part"))
        } else {
          // S3/R2 returns ETags with surrounding quotes — strip them
          resolve(rawEtag.replace(/^"|"$/g, ""))
        }
      } else {
        reject(new Error(`Part upload failed with status ${xhr.status}`))
      }
    }

    xhr.onerror = () => {
      xhrRef.current = null
      reject(new Error("Network error during part upload"))
    }
    xhr.onabort = () => {
      xhrRef.current = null
      reject(new DOMException("Upload cancelled", "AbortError"))
    }

    xhr.send(blob)
  })
}

export function useUpload(options?: {
  project?: string
  category?: string
  folder?: string
  onAllComplete?: () => void
}) {
  const [files, setFiles] = useState<FileUploadItem[]>([])
  const activeCount = useRef(0)
  const queueRef = useRef<FileUploadItem[]>([])
  // For single-part uploads: stores the XHR
  // For multipart uploads: stores the current part's XHR
  const xhrMap = useRef<Map<string, { current: XMLHttpRequest | null }>>(new Map())
  // Signal map for cancelling multipart uploads between parts
  const cancelSignals = useRef<Map<string, { cancelled: boolean }>>(new Map())

  const { call: getUploadUrl } = useFrappePostCall("vms.api.get_upload_url")
  const { call: confirmUpload } = useFrappePostCall("vms.api.confirm_upload")
  const { call: failUpload } = useFrappePostCall("vms.api.fail_upload")
  const { call: getPartUrl } = useFrappePostCall("vms.api.get_part_upload_url")
  const { call: completeMultipart } = useFrappePostCall("vms.api.complete_multipart")
  const { call: abortMultipart } = useFrappePostCall("vms.api.abort_multipart")

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
      if (activeCount.current === 0) {
        options?.onAllComplete?.()
      }
      return
    }
    activeCount.current++
    uploadFile(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Upload a small file in a single PUT request. */
  const uploadSinglePut = useCallback(
    (item: FileUploadItem, uploadUrl: string): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const xhrRef = { current: xhr }
        xhrMap.current.set(item.id, xhrRef)

        xhr.open("PUT", uploadUrl)
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
    },
    [updateFile]
  )

  /** Upload a large file using S3 multipart upload. */
  const uploadMultipart = useCallback(
    async (
      item: FileUploadItem,
      r2Key: string,
      uploadId: string,
      partSize: number,
    ): Promise<void> => {
      const fileSize = item.file.size
      const totalParts = Math.ceil(fileSize / partSize)
      const parts: { PartNumber: number; ETag: string }[] = []
      let totalBytesUploaded = 0

      const signal = { cancelled: false }
      cancelSignals.current.set(item.id, signal)
      const xhrRef = { current: null as XMLHttpRequest | null }
      xhrMap.current.set(item.id, xhrRef)

      try {
        for (let partNum = 1; partNum <= totalParts; partNum++) {
          if (signal.cancelled) {
            throw new DOMException("Upload cancelled", "AbortError")
          }

          const start = (partNum - 1) * partSize
          const end = Math.min(start + partSize, fileSize)
          const blob = item.file.slice(start, end)
          const partBytesBeforeThis = totalBytesUploaded

          // Get presigned URL for this part
          const partRes = await getPartUrl({
            r2_key: r2Key,
            upload_id: uploadId,
            part_number: partNum,
          })
          const partUrl = (partRes.message as { url: string }).url

          // Upload with retries
          let etag: string | undefined
          let lastError: Error | undefined
          for (let attempt = 0; attempt < MAX_PART_RETRIES; attempt++) {
            if (signal.cancelled) {
              throw new DOMException("Upload cancelled", "AbortError")
            }
            try {
              etag = await uploadPart(
                partUrl,
                blob,
                (loaded) => {
                  const current = partBytesBeforeThis + loaded
                  const pct = Math.round((current / fileSize) * 100)
                  updateFile(item.id, { progress: pct })
                },
                signal,
                xhrRef,
              )
              break
            } catch (e) {
              if (e instanceof DOMException && e.name === "AbortError") throw e
              lastError = e instanceof Error ? e : new Error("Part upload failed")
              // Wait before retry (exponential backoff)
              if (attempt < MAX_PART_RETRIES - 1) {
                await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
              }
            }
          }

          if (!etag) {
            throw lastError || new Error(`Failed to upload part ${partNum}`)
          }

          parts.push({ PartNumber: partNum, ETag: etag })
          totalBytesUploaded = end
        }

        // Complete multipart upload
        await completeMultipart({
          asset_name: item.assetName!,
          upload_id: uploadId,
          parts: JSON.stringify(parts),
        })
      } finally {
        cancelSignals.current.delete(item.id)
        xhrMap.current.delete(item.id)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateFile]
  )

  const uploadFile = useCallback(
    async (item: FileUploadItem) => {
      let assetName: string | undefined
      let isMultipart = false
      let uploadId: string | undefined
      try {
        // Step 1: Get presigned URL (or multipart init)
        updateFile(item.id, { status: "uploading", progress: 0 })

        const res = await getUploadUrl({
          file_name: item.displayName,
          content_type: item.file.type || "application/octet-stream",
          file_size: item.file.size,
          project: options?.project || undefined,
          category: options?.category || "Asset",
          folder: options?.folder || undefined,
        })

        const data = res.message as UploadUrlResponse
        assetName = data.asset_name
        isMultipart = data.multipart
        uploadId = data.upload_id
        updateFile(item.id, { assetName: data.asset_name })

        // Step 2: Upload to R2
        if (data.multipart && data.upload_id && data.part_size) {
          await uploadMultipart(item, data.r2_key, data.upload_id, data.part_size)
        } else if (data.upload_url) {
          await uploadSinglePut(item, data.upload_url)
        } else {
          throw new Error("Invalid upload response from server")
        }

        // Step 3: Confirm upload
        updateFile(item.id, { status: "confirming", progress: 100 })
        await confirmUpload({
          asset_name: data.asset_name,
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
        // Clean up the backend asset record
        if (assetName) {
          if (isMultipart && uploadId) {
            abortMultipart({ asset_name: assetName, upload_id: uploadId }).catch(() => {})
          } else {
            failUpload({ asset_name: assetName }).catch(() => {})
          }
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

      // Set cancel signal (stops multipart loop between parts)
      const signal = cancelSignals.current.get(id)
      if (signal) signal.cancelled = true

      // Abort the active XHR (works for both single and multipart)
      const xhrRef = xhrMap.current.get(id)
      if (xhrRef?.current) {
        xhrRef.current.abort()
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
