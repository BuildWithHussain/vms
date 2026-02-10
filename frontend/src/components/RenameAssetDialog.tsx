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

interface RenameAssetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetName: string
  currentFileName: string
  onComplete?: () => void
}

export function RenameAssetDialog({
  open,
  onOpenChange,
  assetName,
  currentFileName,
  onComplete,
}: RenameAssetDialogProps) {
  const lastDot = currentFileName.lastIndexOf(".")
  const hasExtension = lastDot > 0
  const initialStem = hasExtension ? currentFileName.slice(0, lastDot) : currentFileName
  const extension = hasExtension ? currentFileName.slice(lastDot) : ""

  const [stem, setStem] = useState(initialStem)
  const [renaming, setRenaming] = useState(false)

  const { call: renameAsset } = useFrappePostCall("vms.api.rename_asset")

  useEffect(() => {
    if (open) {
      const dot = currentFileName.lastIndexOf(".")
      setStem(dot > 0 ? currentFileName.slice(0, dot) : currentFileName)
    }
  }, [open, currentFileName])

  const trimmedStem = stem.trim()
  const newFileName = trimmedStem + extension
  const isUnchanged = newFileName === currentFileName

  const handleRename = async () => {
    if (!trimmedStem || isUnchanged) return

    setRenaming(true)
    try {
      await renameAsset({ asset_name: assetName, new_file_name: newFileName })
      toast.success("Asset renamed")
      onOpenChange(false)
      onComplete?.()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to rename asset"
      toast.error(message)
    } finally {
      setRenaming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename Asset</DialogTitle>
          <DialogDescription>
            Enter a new name for this asset.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>File Name</Label>
          <div className="flex items-center gap-0">
            <Input
              autoFocus
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename()
              }}
              className={extension ? "rounded-r-none" : ""}
            />
            {extension && (
              <span className="flex h-9 items-center rounded-r-md border border-l-0 bg-muted px-3 text-sm text-muted-foreground">
                {extension}
              </span>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={renaming}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRename}
            disabled={renaming || !trimmedStem || isUnchanged}
          >
            {renaming ? "Renaming..." : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
