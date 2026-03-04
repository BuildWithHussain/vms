import { useRef, useCallback } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"
import type { VMSAsset } from "@/types"

interface VersionUploadResponse {
  upload_url?: string
  r2_key: string
  asset_name: string
  version: number
  multipart: boolean
  upload_id?: string
  part_size?: number
}

/**
 * Hook for uploading a new version of an existing asset.
 * Returns a trigger function that opens a file picker and handles the upload.
 */
export function useVersionUpload(options?: { onComplete?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingAssetRef = useRef<VMSAsset | null>(null)

  const { call: callUploadNewVersion } = useFrappePostCall("vms.api.upload_new_version")
  const { call: callConfirmVersion } = useFrappePostCall("vms.api.confirm_version_upload")
  const { call: callGetPartUrl } = useFrappePostCall("vms.api.get_part_upload_url")
  const { call: callCompleteMultipart } = useFrappePostCall("vms.api.complete_multipart")

  const handleFileSelected = useCallback(
    async (file: File) => {
      const asset = pendingAssetRef.current
      if (!asset) return

      const toastId = toast.loading(`Uploading v${(asset.version || 1) + 1} of ${asset.file_name}...`)

      try {
        // Step 1: Initiate version upload
        const res = await callUploadNewVersion({
          asset_name: asset.name,
          file_name: file.name,
          content_type: file.type || "application/octet-stream",
          file_size: file.size,
        })

        const data = res.message as VersionUploadResponse

        // Step 2: Upload file to R2
        if (data.multipart && data.upload_id && data.part_size) {
          // Multipart upload
          const totalParts = Math.ceil(file.size / data.part_size)
          const parts: { PartNumber: number; ETag: string }[] = []

          for (let partNum = 1; partNum <= totalParts; partNum++) {
            const start = (partNum - 1) * data.part_size
            const end = Math.min(start + data.part_size, file.size)
            const blob = file.slice(start, end)

            const partRes = await callGetPartUrl({
              r2_key: data.r2_key,
              upload_id: data.upload_id,
              part_number: partNum,
            })
            const partUrl = (partRes.message as { url: string }).url

            const etag = await uploadBlob(partUrl, blob)
            parts.push({ PartNumber: partNum, ETag: etag })

            const pct = Math.round((end / file.size) * 100)
            toast.loading(`Uploading v${data.version}... ${pct}%`, { id: toastId })
          }

          await callCompleteMultipart({
            asset_name: data.asset_name,
            upload_id: data.upload_id,
            parts: JSON.stringify(parts),
          })
        } else if (data.upload_url) {
          // Single PUT upload
          await uploadBlob(data.upload_url, file, (pct) => {
            toast.loading(`Uploading v${data.version}... ${pct}%`, { id: toastId })
          })
        } else {
          throw new Error("Invalid upload response")
        }

        // Step 3: Confirm version upload
        await callConfirmVersion({
          asset_name: data.asset_name,
          file_size: file.size,
        })

        toast.success(`Version ${data.version} uploaded`, {
          id: toastId,
          description: file.name,
        })

        options?.onComplete?.()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Upload failed"
        toast.error("Version upload failed", { id: toastId, description: message })
      }
    },
    [callUploadNewVersion, callConfirmVersion, callGetPartUrl, callCompleteMultipart, options],
  )

  const triggerVersionUpload = useCallback(
    (asset: VMSAsset) => {
      pendingAssetRef.current = asset

      // Create or reuse hidden file input
      if (!fileInputRef.current) {
        const input = document.createElement("input")
        input.type = "file"
        input.style.display = "none"
        input.addEventListener("change", () => {
          const file = input.files?.[0]
          if (file) {
            handleFileSelected(file)
          }
          input.value = "" // Reset for next use
        })
        document.body.appendChild(input)
        fileInputRef.current = input
      }

      fileInputRef.current.click()
    },
    [handleFileSelected],
  )

  return { triggerVersionUpload }
}

/** Upload a blob via XHR PUT, returning the ETag. */
function uploadBlob(
  url: string,
  blob: Blob,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag")
        resolve(etag ? etag.replace(/^"|"$/g, "") : "")
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.send(blob)
  })
}
