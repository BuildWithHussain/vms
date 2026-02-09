import { useState, useMemo } from "react"
import { useParams, useNavigate } from "react-router"
import { useFrappeGetDoc, useFrappeGetDocList } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  CloudUploadIcon,
  Delete02Icon,
  Download04Icon,
  GridViewIcon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UploadDialog } from "@/components/UploadDialog"
import { MediaPlayerDialog } from "@/components/MediaPlayerDialog"
import { DeleteAssetDialog } from "@/components/DeleteAssetDialog"
import { useDownload } from "@/hooks/useDownload"
import type { VMSProject, VMSAsset } from "@/types"

const categoryVariant: Record<string, "default" | "secondary" | "outline"> = {
  Source: "outline",
  Cut: "secondary",
  Review: "default",
  Final: "default",
}

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [view, setView] = useState<"list" | "grid">("list")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [playerAsset, setPlayerAsset] = useState<{
    name: string
    fileName: string
    fileType?: string
  } | null>(null)
  const { downloadOne, downloadMany, isDownloading } = useDownload()

  const { data: project } = useFrappeGetDoc<VMSProject>(
    "VMS Project",
    projectId!
  )

  const { data: assets, mutate: mutateAssets } = useFrappeGetDocList<VMSAsset>("VMS Asset", {
    fields: [
      "name",
      "file_name",
      "category",
      "status",
      "file_size",
      "file_type",
      "uploaded_at",
      "creation",
    ],
    filters: [["project", "=", projectId!]],
    orderBy: { field: "creation", order: "desc" },
    limit: 100,
  })

  const assetItems = useMemo(
    () => (assets ?? []).filter((a) => a.category === "Source" || a.category === "Cut"),
    [assets]
  )

  const exportItems = useMemo(
    () => (assets ?? []).filter((a) => a.category === "Review" || a.category === "Final"),
    [assets]
  )

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

  const toggleSelectAll = (items: VMSAsset[]) => {
    const allItemNames = items.map((a) => a.name)
    const allSelected = allItemNames.every((n) => selected.has(n))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        allItemNames.forEach((n) => next.delete(n))
      } else {
        allItemNames.forEach((n) => next.add(n))
      }
      return next
    })
  }

  const handleBulkDownload = () => {
    if (!assets) return
    const toDownload = assets.filter((a) => selected.has(a.name))
    downloadMany(toDownload)
  }

  const handleDeleteComplete = () => {
    setSelected(new Set())
    mutateAssets()
  }

  if (!project) {
    return <div className="text-muted-foreground">Loading project...</div>
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate("/projects")}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-xl font-bold md:text-2xl">{project.project_name}</h1>
            <Badge variant="outline" className="shrink-0">{project.status}</Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">{project.name}</p>
        </div>
      </div>

      {project.description && (
        <Card size="sm">
          <CardContent>
            <div
              className="prose prose-sm max-w-none text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: project.description }}
            />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="assets">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="assets">
              Assets{assetItems.length > 0 ? ` (${assetItems.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="exports">
              Exports{exportItems.length > 0 ? ` (${exportItems.length})` : ""}
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex rounded-lg border border-border">
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => setView("list")}
              >
                <HugeiconsIcon icon={ListViewIcon} strokeWidth={2} />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => setView("grid")}
              >
                <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
              </Button>
            </div>
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

        <TabsContent value="assets">
          <AssetList
            items={assetItems}
            allItems={assetItems}
            view={view}
            selected={selected}
            toggleSelect={toggleSelect}
            toggleSelectAll={() => toggleSelectAll(assetItems)}
            downloadOne={downloadOne}
            onPlay={(name, fileName, fileType) => setPlayerAsset({ name, fileName, fileType })}
            emptyMessage="No source or cut assets yet. Upload some files to get started."
          />
        </TabsContent>

        <TabsContent value="exports">
          <AssetList
            items={exportItems}
            allItems={exportItems}
            view={view}
            selected={selected}
            toggleSelect={toggleSelect}
            toggleSelectAll={() => toggleSelectAll(exportItems)}
            downloadOne={downloadOne}
            onPlay={(name, fileName, fileType) => setPlayerAsset({ name, fileName, fileType })}
            emptyMessage="No review or final exports yet. Upload exports to share with your team."
          />
        </TabsContent>
      </Tabs>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        project={projectId}
        onComplete={() => mutateAssets()}
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

      <DeleteAssetDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        assetNames={Array.from(selected)}
        onComplete={handleDeleteComplete}
      />
    </div>
  )
}

function AssetList({
  items,
  allItems,
  view,
  selected,
  toggleSelect,
  toggleSelectAll,
  downloadOne,
  onPlay,
  emptyMessage,
}: {
  items: VMSAsset[]
  allItems: VMSAsset[]
  view: "list" | "grid"
  selected: Set<string>
  toggleSelect: (name: string) => void
  toggleSelectAll: () => void
  downloadOne: (assetName: string, fileName?: string) => void
  onPlay: (assetName: string, fileName: string, fileType?: string) => void
  emptyMessage: string
}) {
  if (!items.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    )
  }

  const allSelected = allItems.length > 0 && allItems.every((a) => selected.has(a.name))

  return (
    <div className="space-y-2">
      <div className="flex items-center px-3 py-1">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-sm text-muted-foreground">
            {selected.size > 0
              ? `${allItems.filter((a) => selected.has(a.name)).length} of ${allItems.length} selected`
              : "Select all"}
          </span>
        </div>
      </div>

      {view === "list" ? (
        <div className="space-y-2">
          {items.map((asset) => (
            <Card
              key={asset.name}
              size="sm"
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => {
                if (asset.status === "Ready") onPlay(asset.name, asset.file_name, asset.file_type)
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
              {(asset.file_size || asset.uploaded_at) && (
                <CardContent className="pl-10">
                  <div className="flex gap-4 text-xs text-muted-foreground">
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
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((asset) => (
            <Card
              key={asset.name}
              className="flex cursor-pointer flex-col transition-shadow hover:shadow-md"
              onClick={() => {
                if (asset.status === "Ready") onPlay(asset.name, asset.file_name, asset.file_type)
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
                <div className="flex gap-3 text-xs text-muted-foreground">
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
  )
}
