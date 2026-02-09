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
import type { VMSProject } from "@/types"

interface MoveAssetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetNames: string[]
  onComplete?: () => void
}

export function MoveAssetDialog({
  open,
  onOpenChange,
  assetNames,
  onComplete,
}: MoveAssetDialogProps) {
  const [targetProject, setTargetProject] = useState<string>("")
  const [moving, setMoving] = useState(false)

  const { data: projects } = useFrappeGetDocList<VMSProject>("VMS Project", {
    fields: ["name", "project_name"],
    orderBy: { field: "creation", order: "desc" },
    limit: 100,
  })

  const { call: moveAsset } = useFrappePostCall("vms.api.move_asset")

  const handleMove = async () => {
    if (!targetProject) {
      toast.error("Please select a project")
      return
    }

    setMoving(true)
    try {
      for (const assetName of assetNames) {
        await moveAsset({ asset_name: assetName, target_project: targetProject })
      }
      toast.success(
        `Moved ${assetNames.length} asset${assetNames.length > 1 ? "s" : ""} to project`
      )
      setTargetProject("")
      onOpenChange(false)
      onComplete?.()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to move assets"
      toast.error(message)
    } finally {
      setMoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to Project</DialogTitle>
          <DialogDescription>
            Move {assetNames.length} asset{assetNames.length > 1 ? "s" : ""} to
            a project.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Target Project</Label>
          <Select value={targetProject} onValueChange={setTargetProject}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a project..." />
            </SelectTrigger>
            <SelectContent>
              {projects?.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.project_name}
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
          <Button onClick={handleMove} disabled={moving || !targetProject}>
            {moving ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
