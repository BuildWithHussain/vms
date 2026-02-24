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
import { Input } from "@/components/ui/input"
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
  const [confirmText, setConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)

  const { call: deleteFolder } = useFrappePostCall("vms.api.delete_folder")

  const isConfirmed = confirmText === folderDisplayName

  const handleDelete = async () => {
    if (!isConfirmed) return
    setDeleting(true)
    try {
      await deleteFolder({ folder_name: folderName })
      toast.success("Folder deleted")
      onOpenChange(false)
      onComplete?.()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete folder"
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }

  const handleOpenChange = (value: boolean) => {
    if (!value) setConfirmText("")
    onOpenChange(value)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete folder?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                This will delete the folder <strong className="text-foreground">{folderDisplayName}</strong> and
                move all its assets back to the project root. This action cannot be undone.
              </p>
              <p>
                Type <strong className="text-foreground">{folderDisplayName}</strong> to confirm.
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={folderDisplayName}
                autoFocus
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || deleting}
          >
            {deleting ? "Deleting..." : "Delete Folder"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
