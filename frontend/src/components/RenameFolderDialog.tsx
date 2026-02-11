import { useState, useEffect } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface RenameFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderName: string
  folderDisplayName: string
  onComplete?: () => void
}

export function RenameFolderDialog({
  open,
  onOpenChange,
  folderName,
  folderDisplayName,
  onComplete,
}: RenameFolderDialogProps) {
  const [newName, setNewName] = useState(folderDisplayName)
  const { call: renameFolder, loading } = useFrappePostCall("vms.api.rename_folder")

  useEffect(() => {
    if (open) setNewName(folderDisplayName)
  }, [open, folderDisplayName])

  const handleRename = async () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      toast.error("Folder name cannot be empty")
      return
    }
    if (trimmed === folderDisplayName) {
      onOpenChange(false)
      return
    }

    try {
      await renameFolder({ folder_name_id: folderName, new_name: trimmed })
      toast.success(`Folder renamed to "${trimmed}"`)
      onOpenChange(false)
      onComplete?.()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to rename folder"
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename Folder</DialogTitle>
          <DialogDescription>
            Enter a new name for this folder.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-folder-name">Folder Name</Label>
          <Input
            id="new-folder-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter folder name"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleRename()
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={loading || !newName.trim()}>
            {loading ? "Renaming..." : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
