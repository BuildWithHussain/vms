import { useState } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"

interface SplitVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetName: string
  fileName: string
  fileSize?: number
  onSplitStarted?: () => void
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

export function SplitVideoDialog({
  open,
  onOpenChange,
  assetName,
  fileName,
  fileSize,
  onSplitStarted,
}: SplitVideoDialogProps) {
  const [numSlices, setNumSlices] = useState(2)
  const { call: callSplit, loading: isSplitting } = useFrappePostCall(
    "vms.video_split.start_video_split",
  )

  const estimatedPartSize = fileSize && numSlices > 0 ? fileSize / numSlices : 0

  const handleSplit = async () => {
    try {
      await callSplit({ asset_name: assetName, num_slices: numSlices })
      toast.success(`Splitting "${fileName}" into ${numSlices} parts. You'll be notified when done.`)
      onOpenChange(false)
      onSplitStarted?.()
    } catch (err: any) {
      const msg = err?.message || err?._server_messages || "Failed to start split"
      toast.error(typeof msg === "string" ? msg : "Failed to start split")
    }
  }

  return (
    <Dialog open={open} onOpenChange={isSplitting ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Split Video</DialogTitle>
          <DialogDescription>
            Split <span className="font-medium text-foreground">{fileName}</span> into
            equal parts without re-encoding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Number of parts</span>
              <span className="text-sm font-semibold tabular-nums">{numSlices}</span>
            </div>
            <Slider
              value={[numSlices]}
              onValueChange={(val: number[]) => setNumSlices(val[0])}
              min={2}
              max={10}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>2</span>
              <span>10</span>
            </div>
          </div>

          {fileSize && fileSize > 0 && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original size</span>
                <span className="font-medium">{formatSize(fileSize)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">~Size per part</span>
                <span className="font-medium">~{formatSize(estimatedPartSize)}</span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            This runs in the background using stream copy (no quality loss).
            New assets will be created in the same project and folder.
            You'll receive an email when it's done.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSplitting}>
            Cancel
          </Button>
          <Button onClick={handleSplit} disabled={isSplitting}>
            {isSplitting ? (
              <>
                <Spinner className="size-3.5" />
                Starting...
              </>
            ) : (
              `Split into ${numSlices} parts`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
