import { useState, useCallback } from "react"
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { Upload04Icon, CheckmarkCircle02Icon, Download04Icon, ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { formatBytes } from "@/lib/utils"
import { useUploadContext } from "@/contexts/UploadContext"
import type { VMSAsset } from "@/types"

interface VersionInfo {
  version_number: number
  file_name: string
  file_size: number
  file_type: string
  uploaded_by: string
  uploaded_at: string
  thumbnail_url?: string
  uploader_name: string
  uploader_image?: string
  is_current?: boolean
}

interface VersionResponse {
  current: VersionInfo
  versions: VersionInfo[]
  total_versions: number
}

interface VersionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: VMSAsset
  onVersionUploaded?: () => void
}

export function VersionSheet({ open, onOpenChange, asset, onVersionUploaded }: VersionSheetProps) {
  const { data, isLoading, mutate } = useFrappeGetCall<{ message: VersionResponse }>(
    "vms.api.get_asset_versions",
    { asset_name: asset.name },
    open ? `asset-versions-${asset.name}` : null,
  )

  const { openUpload } = useUploadContext()

  const { call: getVersionDownloadUrl } = useFrappePostCall("vms.api.get_version_download_url")
  const { call: restoreVersionCall } = useFrappePostCall("vms.api.restore_version")
  const [downloadingVersion, setDownloadingVersion] = useState<number | null>(null)
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null)
  const [restoreConfirm, setRestoreConfirm] = useState<VersionInfo | null>(null)

  const downloadVersion = useCallback(
    async (versionNumber: number, fileName: string) => {
      try {
        setDownloadingVersion(versionNumber)
        const res = await getVersionDownloadUrl({
          asset_name: asset.name,
          version_number: versionNumber,
        })
        const { url } = res.message as { url: string }
        const a = document.createElement("a")
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } catch {
        toast.error("Failed to download version")
      } finally {
        setDownloadingVersion(null)
      }
    },
    [asset.name, getVersionDownloadUrl],
  )

  const restoreVersion = useCallback(
    async (versionNumber: number) => {
      try {
        setRestoringVersion(versionNumber)
        await restoreVersionCall({
          asset_name: asset.name,
          version_number: versionNumber,
        })
        toast.success(`Restored to v${versionNumber}`)
        mutate()
        onVersionUploaded?.()
      } catch {
        toast.error("Failed to restore version")
      } finally {
        setRestoringVersion(null)
        setRestoreConfirm(null)
      }
    },
    [asset.name, restoreVersionCall, mutate, onVersionUploaded],
  )

  const versionData = data?.message
  const allVersions = versionData
    ? [versionData.current, ...versionData.versions]
    : []

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Version History</SheetTitle>
            <SheetDescription>
              {versionData
                ? `${versionData.total_versions} version${versionData.total_versions !== 1 ? "s" : ""}`
                : "Loading..."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => openUpload({
                versionOf: asset,
                project: asset.project,
                category: asset.category,
                onComplete: () => { mutate(); onVersionUploaded?.() },
              })}
            >
              <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} data-icon="inline-start" size={16} />
              Upload new version
            </Button>

            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Spinner className="size-5" />
              </div>
            )}

            {!isLoading && allVersions.length > 0 && (
              <div className="space-y-2">
                {allVersions.map((v) => (
                  <div
                    key={v.is_current ? "current" : v.version_number}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    {v.thumbnail_url ? (
                      <img
                        src={v.thumbnail_url}
                        alt=""
                        className="size-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="size-10 rounded bg-muted shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">v{v.version_number}</span>
                        {v.is_current && (
                          <Badge variant="default" className="text-[10px] gap-0.5 px-1.5 py-0">
                            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={10} />
                            Current
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{v.file_name}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{v.uploader_name}</span>
                        <span>&middot;</span>
                        <span>{v.file_size ? formatBytes(v.file_size) : ""}</span>
                      </div>
                      {v.uploaded_at && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(v.uploaded_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={downloadingVersion === v.version_number}
                        onClick={() => downloadVersion(v.version_number, v.file_name)}
                        title={`Download v${v.version_number}`}
                      >
                        <HugeiconsIcon icon={Download04Icon} size={14} />
                      </Button>
                      {!v.is_current && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={restoringVersion === v.version_number}
                          onClick={() => setRestoreConfirm(v)}
                          title={`Restore v${v.version_number}`}
                        >
                          <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!restoreConfirm} onOpenChange={(o) => !o && setRestoreConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore <strong>v{restoreConfirm?.version_number}</strong> ({restoreConfirm?.file_name}) as the current version. The current version will be saved to history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoringVersion !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoringVersion !== null}
              onClick={() => restoreConfirm && restoreVersion(restoreConfirm.version_number)}
            >
              {restoringVersion !== null ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
