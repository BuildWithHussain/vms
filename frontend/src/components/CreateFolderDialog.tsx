import { useState } from "react"
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

interface CreateFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: string
  onComplete?: () => void
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  project,
  onComplete,
}: CreateFolderDialogProps) {
  const [folderName, setFolderName] = useState("")
  const { call: createFolder, loading } = useFrappePostCall("vms.api.create_folder")

  const handleCreate = async () => {
    const trimmed = folderName.trim()
    if (!trimmed) {
      toast.error("Folder name cannot be empty")
      return
    }

    try {
      await createFolder({ folder_name: trimmed, project })
      toast.success(`Folder "${trimmed}" created`)
      setFolderName("")
      onOpenChange(false)
      onComplete?.()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create folder"
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
          <DialogDescription>
            Create a new folder in this project.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="folder-name">Folder Name</Label>
          <Input
            id="folder-name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Enter folder name"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleCreate()
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
          <Button onClick={handleCreate} disabled={loading || !folderName.trim()}>
            {loading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
