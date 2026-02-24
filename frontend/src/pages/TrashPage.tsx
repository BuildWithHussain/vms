import { useState } from "react"
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  DeletePutBackIcon,
  Delete04Icon,
} from "@hugeicons/core-free-icons"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { UserAvatar } from "@/components/UserAvatar"
import { formatBytes } from "@/lib/utils"
import type { VMSAsset } from "@/types"

export function TrashPage() {
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false)
  const pageSize = 20

  const { data, isLoading, mutate } = useFrappeGetCall<{
    message: {
      assets: VMSAsset[]
      total: number
      page: number
      page_size: number
      total_pages: number
    }
  }>("vms.api.get_trash_assets", { page, page_size: pageSize })

  const { call: restoreAsset, loading: restoring } = useFrappePostCall("vms.api.restore_asset")
  const { call: permanentlyDelete, loading: permDeleting } = useFrappePostCall("vms.api.permanently_delete_asset")
  const { call: emptyTrash, loading: emptying } = useFrappePostCall("vms.api.empty_trash")

  const assets = data?.message?.assets ?? []
  const total = data?.message?.total ?? 0
  const totalPages = data?.message?.total_pages ?? 1

  const allSelected = assets.length > 0 && assets.every((a) => selected.has(a.name))

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(assets.map((a) => a.name)))
    }
  }

  const handleRestore = async (names?: string[]) => {
    const toRestore = names ?? Array.from(selected)
    try {
      for (const name of toRestore) {
        await restoreAsset({ asset_name: name })
      }
      toast.success(`Restored ${toRestore.length} asset${toRestore.length > 1 ? "s" : ""}`)
      setSelected(new Set())
      mutate()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to restore"
      toast.error(message)
    }
  }

  const handlePermanentDelete = async (names?: string[]) => {
    const toDelete = names ?? Array.from(selected)
    try {
      for (const name of toDelete) {
        await permanentlyDelete({ asset_name: name })
      }
      toast.success(`Permanently deleted ${toDelete.length} asset${toDelete.length > 1 ? "s" : ""}`)
      setSelected(new Set())
      mutate()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete"
      toast.error(message)
    }
  }

  const handleEmptyTrash = async () => {
    try {
      await emptyTrash({})
      toast.success("Trash emptied")
      setSelected(new Set())
      setEmptyTrashOpen(false)
      mutate()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to empty trash"
      toast.error(message)
    }
  }

  const busy = restoring || permDeleting || emptying

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trash</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total} deleted file${total !== 1 ? "s" : ""}`
              : "No files in trash"}
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore()}
                disabled={busy}
              >
                <HugeiconsIcon icon={DeletePutBackIcon} strokeWidth={2} className="mr-1.5 size-4" />
                Restore ({selected.size})
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handlePermanentDelete()}
                disabled={busy}
              >
                <HugeiconsIcon icon={Delete04Icon} strokeWidth={2} className="mr-1.5 size-4" />
                Delete forever ({selected.size})
              </Button>
            </>
          )}
          {total > 0 && selected.size === 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setEmptyTrashOpen(true)}
              disabled={busy}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-1.5 size-4" />
              Empty Trash
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>File Name</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Deleted By</TableHead>
              <TableHead>Deleted</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="size-4" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-6 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                </TableRow>
              ))
            ) : assets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.5} />
                      </EmptyMedia>
                      <EmptyTitle>Trash is empty</EmptyTitle>
                      <EmptyDescription>
                        Deleted files will appear here and be automatically removed after the retention period.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              assets.map((asset) => (
                <TableRow key={asset.name}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(asset.name)}
                      onCheckedChange={() => toggleSelect(asset.name)}
                      aria-label={`Select ${asset.file_name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="max-w-[200px] truncate font-medium block">
                      {asset.file_name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {asset.project_name || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{asset.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        name={asset.deleter_name || ""}
                        image={undefined}
                      />
                      <span className="text-sm">{asset.deleter_name || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {asset.deleted_at
                        ? formatDistanceToNow(new Date(asset.deleted_at), { addSuffix: true })
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-muted-foreground">
                      {asset.file_size ? formatBytes(asset.file_size) : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestore([asset.name])}
                      disabled={busy}
                      title="Restore"
                    >
                      <HugeiconsIcon icon={DeletePutBackIcon} strokeWidth={2} className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Empty Trash confirmation */}
      <AlertDialog open={emptyTrashOpen} onOpenChange={setEmptyTrashOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {total} file{total !== 1 ? "s" : ""} in the trash.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={emptying}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleEmptyTrash}
              disabled={emptying}
            >
              {emptying ? "Emptying..." : "Empty Trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
