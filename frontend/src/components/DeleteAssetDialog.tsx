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
        `Deleted ${assetNames.length} asset${assetNames.length > 1 ? "s" : ""}`
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
          <AlertDialogTitle>Delete {count > 1 ? `${count} assets` : "asset"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {count > 1 ? "these assets" : "this asset"} and
            remove {count > 1 ? "them" : "it"} from storage. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
