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

  const handleDelete = async () => {
    setDeleting(true)
    try {
      for (const assetName of assetNames) {
        await deleteAsset({ asset_name: assetName })
      }
      toast.success(
        `Moved ${assetNames.length} asset${assetNames.length > 1 ? "s" : ""} to trash`
      )
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
