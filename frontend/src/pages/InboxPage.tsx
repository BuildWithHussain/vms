import { useState, useCallback } from "react"
import { DropZoneOverlay } from "@/components/DropZoneOverlay"
import { CategoryBadge } from "@/components/CategoryBadge"
import { useNavigate } from "react-router"
import { useFrappeGetDocList } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon, Delete02Icon, Download04Icon, Film01Icon, GridViewIcon, ListViewIcon, Move01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons"
import { Badge } from "@/components/ui/badge"
import { formatBytes } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { UploadDialog } from "@/components/UploadDialog"
import { MoveAssetDialog } from "@/components/MoveAssetDialog"
import { DeleteAssetDialog } from "@/components/DeleteAssetDialog"
import { RenameAssetDialog } from "@/components/RenameAssetDialog"
import { MediaPlayerDialog } from "@/components/MediaPlayerDialog"
import { useDownload } from "@/hooks/useDownload"
import { UserAvatar } from "@/components/UserAvatar"
import { Skeleton } from "@/components/ui/skeleton"
import type { VMSAsset } from "@/types"

export function InboxPage() {
  const navigate = useNavigate()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [previewAsset, setPreviewAsset] = useState<VMSAsset | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const [view, setView] = useState<"list" | "grid">("grid")
  const { downloadOne, downloadMany, isDownloading } = useDownload()

  const { data: assets, mutate } = useFrappeGetDocList<VMSAsset>("VMS Asset", {
    fields: [
      "name",
      "file_name",
      "category",
      "status",
      "file_size",
      "file_type",
      "uploaded_by",
      "uploaded_at",
      "creation",
      "thumbnail_url",
      "uploaded_by.full_name as uploader_name",
      "uploaded_by.user_image as uploader_image",
    ] as string[],
    filters: [["project", "=", ""]],
    orderBy: { field: "creation", order: "desc" },
    limit: 100,
  })

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!assets) return
    if (selected.size === assets.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(assets.map((a) => a.name)))
    }
  }

  const handleMoveComplete = (targetProject: string) => {
    setSelected(new Set())
    navigate(`/projects/${targetProject}`)
  }

  const handleDeleteComplete = () => {
    setSelected(new Set())
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
    setDroppedFiles(files)
    setUploadOpen(true)
  }, [])

  const allSelected = assets && assets.length > 0 && selected.size === assets.length

  return (
    <DropZoneOverlay onDrop={handlePageDrop}>
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Inbox</h1>
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
          <Button size="sm" onClick={() => setUploadOpen(true)}>
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">
              Your inbox is empty. Upload files here to sort them into projects
              later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-3 py-1">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allSelected ?? false}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">
                {selected.size > 0
                  ? `${selected.size} of ${assets.length} selected`
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
                <Card
                  key={asset.name}
                  size="sm"
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => handleAssetClick(asset)}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
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
                      <div className="flex flex-1 items-center justify-between gap-2 overflow-hidden">
                        <CardTitle className="truncate text-sm">
                          {asset.file_name}
                        </CardTitle>
                        <div className="flex shrink-0 items-center gap-2">
                          {asset.status === "Ready" && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation()
                                downloadOne(asset.name, asset.file_name)
                              }}
                            >
                              <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
                            </Button>
                          )}
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
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pl-10">
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
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {assets.map((asset) => (
                <Card
                  key={asset.name}
                  className="flex cursor-pointer flex-col overflow-hidden pt-0 transition-shadow hover:shadow-md"
                  onClick={() => handleAssetClick(asset)}
                >
                  <div className="aspect-video w-full bg-muted">
                    {asset.thumbnail_url ? (
                      <img src={asset.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                        <HugeiconsIcon icon={Film01Icon} size={32} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                  <CardHeader>
                    <div className="flex items-start gap-2">
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
                  </CardHeader>
                  <CardContent className="mt-auto space-y-2">
                    <div className="flex items-center justify-between">
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
                      {asset.status === "Ready" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation()
                            downloadOne(asset.name, asset.file_name)
                          }}
                        >
                          <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
                        </Button>
                      )}
                    </div>
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
              ))}
            </div>
          )}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open)
          if (!open) setDroppedFiles([])
        }}
        existingFileNames={(assets ?? []).map((a) => a.file_name)}
        initialFiles={droppedFiles.length > 0 ? droppedFiles : undefined}
        onComplete={() => mutate()}
      />

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
