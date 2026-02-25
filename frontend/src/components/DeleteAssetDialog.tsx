import { useState } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"
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

interface DeleteAssetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetNames: string[]
  onComplete?: () => void
}

export function DeleteAssetDialog({
  open,
  onOpenChange,
  assetNames,
  onComplete,
}: DeleteAssetDialogProps) {
  const [deleting, setDeleting] = useState(false)

  const { call: deleteAsset } = useFrappePostCall("vms.api.delete_asset")
  const { call: restoreAsset } = useFrappePostCall("vms.api.restore_asset")

  const handleDelete = async () => {
    setDeleting(true)
    try {
      for (const assetName of assetNames) {
        await deleteAsset({ asset_name: assetName })
      }
      const count = assetNames.length
      const names = [...assetNames]
      toast(`Moved ${count} asset${count > 1 ? "s" : ""} to trash`, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              for (const name of names) {
                await restoreAsset({ asset_name: name })
              }
              toast.success(`Restored ${count} asset${count > 1 ? "s" : ""}`)
              onComplete?.()
            } catch {
              toast.error("Failed to restore")
            }
          },
        },
      })
      onOpenChange(false)
      onComplete?.()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete assets"
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }

  const count = assetNames.length

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move {count > 1 ? `${count} assets` : "asset"} to trash?</AlertDialogTitle>
          <AlertDialogDescription>
            {count > 1 ? "These assets" : "This asset"} will be moved to trash.
            You can restore {count > 1 ? "them" : "it"} from the Trash page before {count > 1 ? "they are" : "it is"} permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Moving to trash..." : "Move to Trash"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
