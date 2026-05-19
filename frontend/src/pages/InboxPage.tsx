import { useState, useCallback } from "react"
import { useSelection } from "@/hooks/useSelection"
import { DropZoneOverlay } from "@/components/DropZoneOverlay"
import { CategoryBadge } from "@/components/CategoryBadge"
import { AssetTags } from "@/components/AssetTags"
import { useNavigate } from "react-router"
import { useFrappeGetCall } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon, Delete02Icon, Download04Icon, Film01Icon, GridViewIcon, Album01Icon, ListViewIcon, Move01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons"
import { Badge } from "@/components/ui/badge"
import { formatBytes } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AssetDropdownMenu, AssetContextMenu } from "@/components/AssetCardMenu"
import type { AssetMenuActions } from "@/components/AssetCardMenu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Checkbox } from "@/components/ui/checkbox"
import { useUploadContext } from "@/contexts/UploadContext"
import { MoveAssetDialog } from "@/components/MoveAssetDialog"
import { DeleteAssetDialog } from "@/components/DeleteAssetDialog"
import { RenameAssetDialog } from "@/components/RenameAssetDialog"
import { MediaPlayerDialog } from "@/components/MediaPlayerDialog"
import { useDownload } from "@/hooks/useDownload"
import { UserAvatar } from "@/components/UserAvatar"
import { Skeleton } from "@/components/ui/skeleton"
import type { VMSAsset } from "@/types"

const PAGE_SIZE = 20

interface PaginatedInboxAssets {
  assets: VMSAsset[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export function UncategorisedPage() {
  const navigate = useNavigate()
  const { openUpload } = useUploadContext()
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [previewAsset, setPreviewAsset] = useState<VMSAsset | null>(null)
  const { selected, toggleSelect, toggleSelectAll, clearSelection } = useSelection()
  const [view, setView] = useState<"list" | "grid">("grid")
  const [page, setPage] = useState(1)
  const { downloadOne, downloadMany, isDownloading } = useDownload()

  const { data: inboxData, mutate } = useFrappeGetCall<{ message: PaginatedInboxAssets }>(
    "vms.api.get_inbox_assets",
    { page, page_size: PAGE_SIZE },
    `inbox-assets-p${page}`,
  )

  const assets = inboxData?.message?.assets ?? null
  const total = inboxData?.message?.total ?? 0
  const totalPages = inboxData?.message?.total_pages ?? 1

  const handleMoveComplete = (targetProject: string) => {
    clearSelection()
    navigate(`/projects/${targetProject}`)
  }

  const handleDeleteComplete = () => {
    clearSelection()
    mutate()
  }

  const handleAssetClick = useCallback(
    (asset: VMSAsset) => {
      if (asset.status !== "Ready") return
      if (asset.file_type?.startsWith("video/")) {
        navigate(`/review/${asset.name}`)
      } else {
        setPreviewAsset(asset)
      }
    },
    [navigate],
  )

  const handleBulkDownload = () => {
    if (!assets) return
    const toDownload = assets.filter((a) => selected.has(a.name))
    downloadMany(toDownload)
  }

  const handlePageDrop = useCallback((files: File[]) => {
    openUpload({
      existingFileNames: (assets ?? []).filter((a: VMSAsset) => a.status === "Ready").map((a: VMSAsset) => a.file_name),
      initialFiles: files,
      onComplete: () => mutate(),
    })
  }, [openUpload, assets, mutate])

  const openInboxUpload = useCallback(() => {
    openUpload({
      existingFileNames: (assets ?? []).filter((a: VMSAsset) => a.status === "Ready").map((a: VMSAsset) => a.file_name),
      onComplete: () => mutate(),
    })
  }, [openUpload, assets, mutate])

  // Individual asset menu handlers
  const handleMenuRename = useCallback(
    (asset: VMSAsset) => {
      clearSelection()
      toggleSelect(asset.name)
      setRenameOpen(true)
    },
    [clearSelection, toggleSelect],
  )

  const handleMenuDelete = useCallback(
    (asset: VMSAsset) => {
      clearSelection()
      toggleSelect(asset.name)
      setDeleteOpen(true)
    },
    [clearSelection, toggleSelect],
  )

  const handleMenuMove = useCallback(
    (asset: VMSAsset) => {
      clearSelection()
      toggleSelect(asset.name)
      setMoveOpen(true)
    },
    [clearSelection, toggleSelect],
  )

  const menuActions: AssetMenuActions = {
    onOpen: handleAssetClick,
    onDownload: (asset) => downloadOne(asset.name, asset.file_name),
    onUploadNewVersion: (asset) => openUpload({
      versionOf: asset,
      project: asset.project,
      category: asset.category,
      onComplete: () => mutate(),
    }),
    onRename: handleMenuRename,
    onDelete: handleMenuDelete,
    onMoveToFolder: handleMenuMove,
  }

  const allSelected = assets && assets.length > 0 && assets.every((a: VMSAsset) => selected.has(a.name))

  return (
    <DropZoneOverlay onDrop={handlePageDrop}>
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Uncategorised{total > 0 ? ` (${total})` : ""}</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Assets uploaded without a project. Move them into a project when
            ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDownload}
                disabled={isDownloading}
              >
                <HugeiconsIcon
                  icon={Download04Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                <span className="hidden sm:inline">
                  {isDownloading ? "Downloading..." : "Download"}
                </span>
                <span className="sm:hidden">
                  {selected.size}
                </span>
                <span className="hidden sm:inline"> ({selected.size})</span>
              </Button>
              {selected.size === 1 && (
                <Button variant="outline" size="sm" onClick={() => setRenameOpen(true)}>
                  <HugeiconsIcon
                    icon={PencilEdit01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  <span className="hidden sm:inline">Rename</span>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
                <HugeiconsIcon
                  icon={Move01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                <span className="hidden sm:inline">Move ({selected.size})</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
                <HugeiconsIcon
                  icon={Delete02Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                <span className="hidden sm:inline">Delete ({selected.size})</span>
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => openInboxUpload()}>
            <HugeiconsIcon
              icon={CloudUploadIcon}
              strokeWidth={1.5}
              data-icon="inline-start"
            />
            Upload
          </Button>
        </div>
      </div>

      {!assets ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="flex flex-col overflow-hidden pt-0">
              <Skeleton className="aspect-video w-full rounded-none" />
              <CardHeader>
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent className="mt-auto space-y-2">
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Album01Icon} strokeWidth={1.5} />
            </EmptyMedia>
            <EmptyTitle>No uncategorised assets</EmptyTitle>
            <EmptyDescription>
              Upload files here to sort them into projects later.
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" onClick={() => openInboxUpload()}>
            <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.5} data-icon="inline-start" />
            Upload
          </Button>
        </Empty>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-3 py-1">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allSelected ?? false}
                onCheckedChange={() => toggleSelectAll(assets ?? [])}
              />
              <span className="text-sm text-muted-foreground">
                {selected.size > 0
                  ? `${selected.size} selected`
                  : "Select all"}
              </span>
            </div>
            <ToggleGroup
              className="hidden sm:flex"
              value={[view]}
              onValueChange={(values) => { if (values.length > 0) setView(values[values.length - 1] as "list" | "grid") }}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="list" aria-label="List view">
                <HugeiconsIcon icon={ListViewIcon} strokeWidth={2} />
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Grid view">
                <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {view === "list" ? (
            <div className="space-y-2">
              {assets.map((asset) => (
                <AssetContextMenu key={asset.name} asset={asset} actions={menuActions}>
                  <Card
                    size="sm"
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => handleAssetClick(asset)}
                  >
                    <CardHeader>
                      <div className="flex min-w-0 items-center gap-3">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(asset.name)}
                            onCheckedChange={() => toggleSelect(asset.name)}
                          />
                        </div>
                        <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-muted">
                          {asset.thumbnail_url ? (
                            <img src={asset.thumbnail_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                              <HugeiconsIcon icon={Film01Icon} size={18} strokeWidth={1.5} />
                            </div>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <CardTitle className="truncate text-sm">
                            {asset.file_name}
                          </CardTitle>
                          <div className="flex shrink-0 items-center gap-2">
                            <CategoryBadge
                              assetName={asset.name}
                              category={asset.category}
                              onChanged={() => mutate()}
                            />
                            <Badge
                              variant={
                                asset.status === "Ready" ? "secondary" : "outline"
                              }
                            >
                              {asset.status}
                            </Badge>
                            <div onClick={(e) => e.stopPropagation()}>
                              <AssetDropdownMenu asset={asset} actions={menuActions} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pl-10">
                      <AssetTags
                        assetName={asset.name}
                        tags={asset.tags ?? []}
                        compact
                        onChanged={() => mutate()}
                      />
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <UserAvatar name={asset.uploader_name} image={asset.uploader_image} />
                        {asset.file_size && (
                          <span>
                            {formatBytes(asset.file_size)}
                          </span>
                        )}
                        {asset.uploaded_at && (
                          <span>
                            Uploaded{" "}
                            {new Date(asset.uploaded_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </AssetContextMenu>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {assets.map((asset) => (
                <AssetContextMenu key={asset.name} asset={asset} actions={menuActions}>
                  <Card
                    className="flex cursor-pointer flex-col overflow-hidden pt-0 transition-shadow hover:shadow-md"
                    onClick={() => handleAssetClick(asset)}
                  >
                    <div className="flex aspect-video w-full items-center justify-center bg-muted">
                      {asset.thumbnail_url ? (
                        <img src={asset.thumbnail_url} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                          <HugeiconsIcon icon={Film01Icon} size={32} strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <CardHeader>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <div onClick={(e) => e.stopPropagation()} className="mt-0.5">
                            <Checkbox
                              checked={selected.has(asset.name)}
                              onCheckedChange={() => toggleSelect(asset.name)}
                            />
                          </div>
                          <CardTitle className="truncate text-sm">
                            {asset.file_name}
                          </CardTitle>
                        </div>
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                          <AssetDropdownMenu asset={asset} actions={menuActions} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="mt-auto space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        <CategoryBadge
                          assetName={asset.name}
                          category={asset.category}
                          onChanged={() => mutate()}
                        />
                        <Badge
                          variant={
                            asset.status === "Ready" ? "secondary" : "outline"
                          }
                        >
                          {asset.status}
                        </Badge>
                      </div>
                      <AssetTags
                        assetName={asset.name}
                        tags={asset.tags ?? []}
                        onChanged={() => mutate()}
                      />
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <UserAvatar name={asset.uploader_name} image={asset.uploader_image} />
                        {asset.file_size && (
                          <span>
                            {formatBytes(asset.file_size)}
                          </span>
                        )}
                        {asset.uploaded_at && (
                          <span>
                            {new Date(asset.uploaded_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </AssetContextMenu>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
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
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}


      <MoveAssetDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        assetNames={Array.from(selected)}
        onComplete={handleMoveComplete}
      />

      <DeleteAssetDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        assetNames={Array.from(selected)}
        onComplete={handleDeleteComplete}
      />

      {selected.size === 1 && (() => {
        const selectedAsset = assets?.find((a) => a.name === Array.from(selected)[0])
        return selectedAsset ? (
          <RenameAssetDialog
            open={renameOpen}
            onOpenChange={setRenameOpen}
            assetName={selectedAsset.name}
            currentFileName={selectedAsset.file_name}
            onComplete={() => mutate()}
          />
        ) : null
      })()}

      <MediaPlayerDialog
        open={!!previewAsset}
        onOpenChange={(open) => { if (!open) setPreviewAsset(null) }}
        assetName={previewAsset?.name ?? null}
        fileName={previewAsset?.file_name}
        fileType={previewAsset?.file_type}
      />
    </div>
    </DropZoneOverlay>
  )
}
