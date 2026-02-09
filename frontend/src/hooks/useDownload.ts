import { useState, useCallback } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"

export function useDownload() {
  const [isDownloading, setIsDownloading] = useState(false)
  const { call: getDownloadUrl } = useFrappePostCall("vms.api.get_download_url")

  const triggerDownload = (url: string, fileName: string) => {
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const downloadOne = useCallback(
    async (assetName: string, fileName?: string) => {
      try {
        setIsDownloading(true)
        const res = await getDownloadUrl({ asset_name: assetName })
        const { url } = res.message as { url: string }
        triggerDownload(url, fileName || assetName)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Download failed"
        toast.error(message)
      } finally {
        setIsDownloading(false)
      }
    },
    [getDownloadUrl]
  )

  const downloadMany = useCallback(
    async (assets: { name: string; file_name: string }[]) => {
      setIsDownloading(true)
      let failed = 0
      try {
        for (const asset of assets) {
          try {
            const res = await getDownloadUrl({ asset_name: asset.name })
            const { url } = res.message as { url: string }
            triggerDownload(url, asset.file_name)
            // Small delay between downloads so the browser handles them properly
            if (assets.length > 1) {
              await new Promise((r) => setTimeout(r, 300))
            }
          } catch {
            failed++
          }
        }
        if (failed > 0) {
          toast.error(`${failed} download(s) failed`)
        }
      } finally {
        setIsDownloading(false)
      }
    },
    [getDownloadUrl]
  )

  return { downloadOne, downloadMany, isDownloading }
}
