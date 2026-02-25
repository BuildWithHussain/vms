import { useState } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

interface DeleteFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderName: string
  folderDisplayName: string
  onComplete?: () => void
}

export function DeleteFolderDialog({
  open,
  onOpenChange,
  folderName,
  folderDisplayName,
  onComplete,
}: DeleteFolderDialogProps) {
  const [deleting, setDeleting] = useState(false)

  const { call: deleteFolder } = useFrappePostCall("vms.api.delete_folder")
  const { call: restoreFolder } = useFrappePostCall("vms.api.restore_folder")

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteFolder({ folder_name: folderName })
      const name = folderName
      toast("Folder moved to trash", {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await restoreFolder({ folder_name: name })
              toast.success("Folder restored")
              onComplete?.()
            } catch {
              toast.error("Failed to restore folder")
            }
          },
        },
      })
      onOpenChange(false)
      onComplete?.()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete folder"
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move folder to trash?</AlertDialogTitle>
          <AlertDialogDescription>
            The folder <strong className="text-foreground">{folderDisplayName}</strong> will be
            moved to trash. You can restore it from the Trash page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Moving..." : "Move to Trash"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
