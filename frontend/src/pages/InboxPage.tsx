import { useState } from "react"
import { useFrappeGetDocList } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon, Delete02Icon, Download04Icon, GridViewIcon, ListViewIcon, Move01Icon } from "@hugeicons/core-free-icons"
import { Badge } from "@/components/ui/badge"
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
import { MediaPlayerDialog } from "@/components/MediaPlayerDialog"
import { useDownload } from "@/hooks/useDownload"
import { UserAvatar } from "@/components/UserAvatar"
import type { VMSAsset } from "@/types"

const categoryVariant: Record<string, "default" | "secondary" | "outline"> = {
  Source: "outline",
  Cut: "secondary",
  Review: "default",
  Final: "default",
}

export function InboxPage() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [view, setView] = useState<"list" | "grid">("list")
  const [playerAsset, setPlayerAsset] = useState<{
    name: string
    fileName: string
    fileType?: string
  } | null>(null)
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

  const handleMoveComplete = () => {
    setSelected(new Set())
    mutate()
  }

  const handleDeleteComplete = () => {
    setSelected(new Set())
    mutate()
  }

  const handleBulkDownload = () => {
    if (!assets) return
    const toDownload = assets.filter((a) => selected.has(a.name))
    downloadMany(toDownload)
  }

  const allSelected = assets && assets.length > 0 && selected.size === assets.length

  return (
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
        <div className="text-muted-foreground">Loading assets...</div>
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
              type="single"
              value={view}
              onValueChange={(v) => { if (v) setView(v as "list" | "grid") }}
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
                  onClick={() => {
                    if (asset.status === "Ready")
                      setPlayerAsset({ name: asset.name, fileName: asset.file_name, fileType: asset.file_type })
                  }}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(asset.name)}
                          onCheckedChange={() => toggleSelect(asset.name)}
                        />
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
                          <Badge
                            variant={categoryVariant[asset.category] ?? "outline"}
                          >
                            {asset.category}
                          </Badge>
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
                          {(asset.file_size / 1024 / 1024).toFixed(1)} MB
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
                  className="flex cursor-pointer flex-col transition-shadow hover:shadow-md"
                  onClick={() => {
                    if (asset.status === "Ready")
                      setPlayerAsset({ name: asset.name, fileName: asset.file_name, fileType: asset.file_type })
                  }}
                >
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
                        <Badge
                          variant={categoryVariant[asset.category] ?? "outline"}
                        >
                          {asset.category}
                        </Badge>
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
                          {(asset.file_size / 1024 / 1024).toFixed(1)} MB
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
        onOpenChange={setUploadOpen}
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

      <MediaPlayerDialog
        open={!!playerAsset}
        onOpenChange={(open) => {
          if (!open) setPlayerAsset(null)
        }}
        assetName={playerAsset?.name ?? null}
        fileName={playerAsset?.fileName}
        fileType={playerAsset?.fileType}
      />
    </div>
  )
}
