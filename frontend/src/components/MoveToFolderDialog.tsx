import { useState } from "react"
import { useFrappeGetDocList, useFrappePostCall } from "frappe-react-sdk"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { VMSFolder } from "@/types"

interface MoveToFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetNames: string[]
  project: string
  currentFolder?: string | null
  onComplete?: () => void
}

const ROOT_VALUE = "__root__"

export function MoveToFolderDialog({
  open,
  onOpenChange,
  assetNames,
  project,
  currentFolder,
  onComplete,
}: MoveToFolderDialogProps) {
  const [targetFolder, setTargetFolder] = useState<string>("")
  const [moving, setMoving] = useState(false)

  const { data: folders } = useFrappeGetDocList<VMSFolder>("VMS Folder", {
    fields: ["name", "folder_name"],
    filters: [["project", "=", project], ["deleted_at", "is", "not set"]],
    orderBy: { field: "folder_name", order: "asc" },
    limit: 100,
  })

  const { call: moveAssets } = useFrappePostCall("vms.api.move_assets_to_folder")

  const handleMove = async () => {
    if (!targetFolder) {
      toast.error("Please select a destination")
      return
    }

    setMoving(true)
    try {
      const folder = targetFolder === ROOT_VALUE ? null : targetFolder
      await moveAssets({
        asset_names: JSON.stringify(assetNames),
        folder,
      })
      toast.success(
        `Moved ${assetNames.length} asset${assetNames.length > 1 ? "s" : ""}`
      )
      setTargetFolder("")
      onOpenChange(false)
      onComplete?.()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to move assets"
      toast.error(message)
    } finally {
      setMoving(false)
    }
  }

  // Filter out the current folder from options
  const availableFolders = (folders ?? []).filter((f) => f.name !== currentFolder)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to Folder</DialogTitle>
          <DialogDescription>
            Move {assetNames.length} asset{assetNames.length > 1 ? "s" : ""} to
            a folder.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Destination</Label>
          <Select value={targetFolder} onValueChange={setTargetFolder}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value: string | null) => {
                  if (!value) return "Select a folder..."
                  if (value === ROOT_VALUE) return "Project Root (no folder)"
                  return (folders ?? []).find((f) => f.name === value)?.folder_name ?? value
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {currentFolder && (
                <SelectItem value={ROOT_VALUE}>
                  Project Root (no folder)
                </SelectItem>
              )}
              {availableFolders.map((f) => (
                <SelectItem key={f.name} value={f.name}>
                  {f.folder_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={moving}
          >
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={moving || !targetFolder}>
            {moving ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
