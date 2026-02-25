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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import type { VMSAsset, VMSFolder } from "@/types"

export function TrashPage() {
  const [tab, setTab] = useState("assets")
  const [assetPage, setAssetPage] = useState(1)
  const [folderPage, setFolderPage] = useState(1)
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set())
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false)
  const pageSize = 20

  // Assets data
  const { data: assetData, isLoading: assetsLoading, mutate: mutateAssets } = useFrappeGetCall<{
    message: {
      assets: VMSAsset[]
      total: number
      page: number
      page_size: number
      total_pages: number
    }
  }>("vms.api.get_trash_assets", { page: assetPage, page_size: pageSize })

  // Folders data
  const { data: folderData, isLoading: foldersLoading, mutate: mutateFolders } = useFrappeGetCall<{
    message: {
      folders: VMSFolder[]
      total: number
      page: number
      page_size: number
      total_pages: number
    }
  }>("vms.api.get_trash_folders", { page: folderPage, page_size: pageSize })

  const { call: restoreAsset, loading: restoringAsset } = useFrappePostCall("vms.api.restore_asset")
  const { call: permanentlyDelete, loading: permDeleting } = useFrappePostCall("vms.api.permanently_delete_asset")
  const { call: restoreFolder, loading: restoringFolder } = useFrappePostCall("vms.api.restore_folder")
  const { call: permanentlyDeleteFolder, loading: permDeletingFolder } = useFrappePostCall("vms.api.permanently_delete_folder")
  const { call: emptyTrash, loading: emptying } = useFrappePostCall("vms.api.empty_trash")

  const assets = assetData?.message?.assets ?? []
  const assetTotal = assetData?.message?.total ?? 0
  const assetTotalPages = assetData?.message?.total_pages ?? 1

  const folders = folderData?.message?.folders ?? []
  const folderTotal = folderData?.message?.total ?? 0
  const folderTotalPages = folderData?.message?.total_pages ?? 1

  const totalItems = assetTotal + folderTotal

  const allAssetsSelected = assets.length > 0 && assets.every((a) => selectedAssets.has(a.name))
  const allFoldersSelected = folders.length > 0 && folders.every((f) => selectedFolders.has(f.name))

  const busy = restoringAsset || permDeleting || restoringFolder || permDeletingFolder || emptying

  // Asset handlers
  const toggleAssetSelect = (name: string) => {
    setSelectedAssets((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAllAssets = () => {
    if (allAssetsSelected) setSelectedAssets(new Set())
    else setSelectedAssets(new Set(assets.map((a) => a.name)))
  }

  const handleRestoreAssets = async (names?: string[]) => {
    const toRestore = names ?? Array.from(selectedAssets)
    try {
      for (const name of toRestore) await restoreAsset({ asset_name: name })
      toast.success(`Restored ${toRestore.length} asset${toRestore.length > 1 ? "s" : ""}`)
      setSelectedAssets(new Set())
      mutateAssets()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to restore")
    }
  }

  const handlePermDeleteAssets = async (names?: string[]) => {
    const toDelete = names ?? Array.from(selectedAssets)
    try {
      for (const name of toDelete) await permanentlyDelete({ asset_name: name })
      toast.success(`Permanently deleted ${toDelete.length} asset${toDelete.length > 1 ? "s" : ""}`)
      setSelectedAssets(new Set())
      mutateAssets()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete")
    }
  }

  // Folder handlers
  const toggleFolderSelect = (name: string) => {
    setSelectedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAllFolders = () => {
    if (allFoldersSelected) setSelectedFolders(new Set())
    else setSelectedFolders(new Set(folders.map((f) => f.name)))
  }

  const handleRestoreFolders = async (names?: string[]) => {
    const toRestore = names ?? Array.from(selectedFolders)
    try {
      for (const name of toRestore) await restoreFolder({ folder_name: name })
      toast.success(`Restored ${toRestore.length} folder${toRestore.length > 1 ? "s" : ""}`)
      setSelectedFolders(new Set())
      mutateFolders()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to restore")
    }
  }

  const handlePermDeleteFolders = async (names?: string[]) => {
    const toDelete = names ?? Array.from(selectedFolders)
    try {
      for (const name of toDelete) await permanentlyDeleteFolder({ folder_name: name })
      toast.success(`Permanently deleted ${toDelete.length} folder${toDelete.length > 1 ? "s" : ""}`)
      setSelectedFolders(new Set())
      mutateFolders()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete")
    }
  }

  const handleEmptyTrash = async () => {
    try {
      await emptyTrash({})
      toast.success("Trash emptied")
      setSelectedAssets(new Set())
      setSelectedFolders(new Set())
      setEmptyTrashOpen(false)
      mutateAssets()
      mutateFolders()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to empty trash")
    }
  }

  const selectedCount = tab === "assets" ? selectedAssets.size : selectedFolders.size

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trash</h1>
          <p className="text-sm text-muted-foreground">
            {totalItems > 0
              ? `${totalItems} deleted item${totalItems !== 1 ? "s" : ""}`
              : "No items in trash"}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "assets" && selectedAssets.size > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleRestoreAssets()} disabled={busy}>
                <HugeiconsIcon icon={DeletePutBackIcon} strokeWidth={2} className="mr-1.5 size-4" />
                Restore ({selectedAssets.size})
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handlePermDeleteAssets()} disabled={busy}>
                <HugeiconsIcon icon={Delete04Icon} strokeWidth={2} className="mr-1.5 size-4" />
                Delete forever ({selectedAssets.size})
              </Button>
            </>
          )}
          {tab === "folders" && selectedFolders.size > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleRestoreFolders()} disabled={busy}>
                <HugeiconsIcon icon={DeletePutBackIcon} strokeWidth={2} className="mr-1.5 size-4" />
                Restore ({selectedFolders.size})
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handlePermDeleteFolders()} disabled={busy}>
                <HugeiconsIcon icon={Delete04Icon} strokeWidth={2} className="mr-1.5 size-4" />
                Delete forever ({selectedFolders.size})
              </Button>
            </>
          )}
          {totalItems > 0 && selectedCount === 0 && (
            <Button variant="destructive" size="sm" onClick={() => setEmptyTrashOpen(true)} disabled={busy}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-1.5 size-4" />
              Empty Trash
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelectedAssets(new Set()); setSelectedFolders(new Set()) }}>
        <TabsList>
          <TabsTrigger value="assets">
            Assets{assetTotal > 0 ? ` (${assetTotal})` : ""}
          </TabsTrigger>
          <TabsTrigger value="folders">
            Folders{folderTotal > 0 ? ` (${folderTotal})` : ""}
          </TabsTrigger>
        </TabsList>

        {/* Assets Tab */}
        <TabsContent value="assets">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allAssetsSelected} onCheckedChange={toggleAllAssets} aria-label="Select all" />
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
                {assetsLoading ? (
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
                          <EmptyTitle>No deleted assets</EmptyTitle>
                          <EmptyDescription>
                            Deleted assets will appear here.
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
                          checked={selectedAssets.has(asset.name)}
                          onCheckedChange={() => toggleAssetSelect(asset.name)}
                          aria-label={`Select ${asset.file_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="max-w-[200px] truncate font-medium block">{asset.file_name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{asset.project_name || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{asset.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserAvatar name={asset.deleter_name || ""} image={undefined} />
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
                          onClick={() => handleRestoreAssets([asset.name])}
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

          {assetTotalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={assetPage <= 1} onClick={() => setAssetPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {assetPage} of {assetTotalPages}
              </span>
              <Button variant="outline" size="sm" disabled={assetPage >= assetTotalPages} onClick={() => setAssetPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Folders Tab */}
        <TabsContent value="folders">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allFoldersSelected} onCheckedChange={toggleAllFolders} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Folder Name</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Deleted By</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {foldersLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="size-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Skeleton className="size-6 rounded-full" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : folders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <Empty className="border-0">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.5} />
                          </EmptyMedia>
                          <EmptyTitle>No deleted folders</EmptyTitle>
                          <EmptyDescription>
                            Deleted folders will appear here.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  folders.map((folder) => (
                    <TableRow key={folder.name}>
                      <TableCell>
                        <Checkbox
                          checked={selectedFolders.has(folder.name)}
                          onCheckedChange={() => toggleFolderSelect(folder.name)}
                          aria-label={`Select ${folder.folder_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{folder.folder_name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{folder.project_name || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserAvatar name={folder.deleter_name || ""} image={undefined} />
                          <span className="text-sm">{folder.deleter_name || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {folder.deleted_at
                            ? formatDistanceToNow(new Date(folder.deleted_at), { addSuffix: true })
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestoreFolders([folder.name])}
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

          {folderTotalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={folderPage <= 1} onClick={() => setFolderPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {folderPage} of {folderTotalPages}
              </span>
              <Button variant="outline" size="sm" disabled={folderPage >= folderTotalPages} onClick={() => setFolderPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Empty Trash confirmation */}
      <AlertDialog open={emptyTrashOpen} onOpenChange={setEmptyTrashOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {totalItems} item{totalItems !== 1 ? "s" : ""} in the trash
              ({assetTotal} asset{assetTotal !== 1 ? "s" : ""}, {folderTotal} folder{folderTotal !== 1 ? "s" : ""}).
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
