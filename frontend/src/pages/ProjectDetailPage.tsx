import { useState, useMemo, useCallback } from "react"
import { useParams, useNavigate } from "react-router"
import { useFrappeGetDoc, useFrappeGetDocList, useFrappePostCall } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  CloudUploadIcon,
  Delete02Icon,
  Download04Icon,
  Film01Icon,
  Folder02Icon,
  FolderAddIcon,
  FolderTransferIcon,
  GridViewIcon,
  Link01Icon,
  ListViewIcon,
  Copy01Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons"
import { Badge } from "@/components/ui/badge"
import { formatBytes } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UploadDialog } from "@/components/UploadDialog"
import { DeleteAssetDialog } from "@/components/DeleteAssetDialog"
import { RenameAssetDialog } from "@/components/RenameAssetDialog"
import { MediaPlayerDialog } from "@/components/MediaPlayerDialog"
import { CreateFolderDialog } from "@/components/CreateFolderDialog"
import { RenameFolderDialog } from "@/components/RenameFolderDialog"
import { MoveToFolderDialog } from "@/components/MoveToFolderDialog"
import { DropZoneOverlay } from "@/components/DropZoneOverlay"
import { useDownload } from "@/hooks/useDownload"
import { UserAvatar } from "@/components/UserAvatar"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import type { VMSProject, VMSAsset, VMSFolder } from "@/types"

const categoryVariant: Record<string, "default" | "secondary" | "outline"> = {
  Asset: "outline",
  "For Review": "default",
  Deliverable: "secondary",
}

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [moveToFolderOpen, setMoveToFolderOpen] = useState(false)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const [previewAsset, setPreviewAsset] = useState<VMSAsset | null>(null)
  const [view, setView] = useState<"list" | "grid">("grid")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const { downloadOne, downloadMany, isDownloading } = useDownload()

  const { call: callTogglePublicReview } = useFrappePostCall("vms.review_api.toggle_public_review")
  const { call: callDeleteFolder } = useFrappePostCall("vms.api.delete_folder")
  const { call: callMoveToFolder } = useFrappePostCall("vms.api.move_assets_to_folder")

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
      "uploaded_by",
      "uploaded_at",
      "creation",
      "thumbnail_url",
      "is_public_review",
      "review_token",
      "folder",
      "uploaded_by.full_name as uploader_name",
      "uploaded_by.user_image as uploader_image",
    ] as string[],
    filters: [["project", "=", projectId!]],
    orderBy: { field: "creation", order: "desc" },
    limit: 100,
  })

  const { data: folders, mutate: mutateFolders } = useFrappeGetDocList<VMSFolder>("VMS Folder", {
    fields: ["name", "folder_name", "creation"],
    filters: [["project", "=", projectId!]],
    orderBy: { field: "folder_name", order: "asc" },
    limit: 100,
  })

  const currentFolderDoc = useMemo(
    () => (folders ?? []).find((f) => f.name === currentFolder) ?? null,
    [folders, currentFolder],
  )

  const handleTogglePublicReview = useCallback(
    async (assetName: string, enable: boolean) => {
      await callTogglePublicReview({ asset_name: assetName, enable: enable ? 1 : 0 })
      mutateAssets()
    },
    [callTogglePublicReview, mutateAssets],
  )

  // Filter assets by current folder
  const folderAssets = useMemo(
    () =>
      (assets ?? []).filter((a) =>
        currentFolder ? a.folder === currentFolder : !a.folder
      ),
    [assets, currentFolder],
  )

  const forReviewItems = useMemo(
    () => (assets ?? []).filter((a) => a.category === "For Review"),
    [assets]
  )

  const deliverableItems = useMemo(
    () => (assets ?? []).filter((a) => a.category === "Deliverable"),
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

  const handleAssetClick = useCallback(
    (assetName: string) => {
      const asset = (assets ?? []).find((a) => a.name === assetName)
      if (!asset || asset.status !== "Ready") return
      if (asset.file_type?.startsWith("video/")) {
        navigate(`/review/${assetName}`)
      } else {
        setPreviewAsset(asset)
      }
    },
    [assets, navigate],
  )

  const handleDeleteComplete = () => {
    setSelected(new Set())
    mutateAssets()
  }

  const handleFolderClick = (folderName: string) => {
    setCurrentFolder(folderName)
    setSelected(new Set())
  }

  const handleNavigateToRoot = () => {
    setCurrentFolder(null)
    setSelected(new Set())
  }

  const handleDeleteFolder = async () => {
    if (!currentFolder) return
    try {
      await callDeleteFolder({ folder_name: currentFolder })
      toast.success("Folder deleted")
      setCurrentFolder(null)
      mutateFolders()
      mutateAssets()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete folder"
      toast.error(message)
    }
  }

  const handleMoveToFolderComplete = () => {
    setSelected(new Set())
    mutateAssets()
  }

  const handlePageDrop = useCallback((files: File[]) => {
    setDroppedFiles(files)
    setUploadOpen(true)
  }, [])

  const handleFolderCreated = () => {
    mutateFolders()
  }

  const handleFolderRenamed = () => {
    mutateFolders()
  }

  const handleDropToFolder = useCallback(
    async (assetNames: string[], folderName: string | null) => {
      try {
        await callMoveToFolder({ asset_names: JSON.stringify(assetNames), folder: folderName })
        toast.success(`Moved ${assetNames.length} ${assetNames.length === 1 ? "asset" : "assets"}`)
        setSelected(new Set())
        mutateAssets()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to move assets"
        toast.error(message)
      }
    },
    [callMoveToFolder, mutateAssets],
  )

  if (!project) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <DropZoneOverlay onDrop={handlePageDrop}>
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
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

      {/* Breadcrumb */}
      {currentFolder && currentFolderDoc && (
        <BreadcrumbNav
          projectName={project.project_name}
          folderName={currentFolderDoc.folder_name}
          onNavigateToRoot={handleNavigateToRoot}
          onDropToRoot={(names) => handleDropToFolder(names, null)}
        />
      )}

      <Tabs defaultValue="all">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="all">
              All{folderAssets.length > 0 ? ` (${folderAssets.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="for-review">
              For Review{forReviewItems.length > 0 ? ` (${forReviewItems.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="deliverables">
              Deliverables{deliverableItems.length > 0 ? ` (${deliverableItems.length})` : ""}
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
                <Button variant="outline" size="sm" onClick={() => setMoveToFolderOpen(true)}>
                  <HugeiconsIcon
                    icon={FolderTransferIcon}
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
            {!currentFolder && (
              <Button variant="outline" size="sm" onClick={() => setCreateFolderOpen(true)}>
                <HugeiconsIcon
                  icon={FolderAddIcon}
                  strokeWidth={1.5}
                  data-icon="inline-start"
                />
                <span className="hidden sm:inline">New Folder</span>
              </Button>
            )}
            {currentFolder && (
              <>
                <Button variant="outline" size="sm" onClick={() => setRenameFolderOpen(true)}>
                  <HugeiconsIcon
                    icon={PencilEdit01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  <span className="hidden sm:inline">Rename</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeleteFolder}>
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  <span className="hidden sm:inline">Delete Folder</span>
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

        <TabsContent value="all">
          <AssetList
            items={folderAssets}
            allItems={folderAssets}
            view={view}
            selected={selected}
            toggleSelect={toggleSelect}
            toggleSelectAll={() => toggleSelectAll(folderAssets)}
            downloadOne={downloadOne}
            onPlay={handleAssetClick}
            onTogglePublicReview={handleTogglePublicReview}
            folders={currentFolder ? undefined : folders ?? undefined}
            onFolderClick={handleFolderClick}
            onDropToFolder={currentFolder ? undefined : handleDropToFolder}
            draggable={(folders ?? []).length > 0 || !!currentFolder}
            emptyMessage={
              currentFolder
                ? "This folder is empty. Upload files or move assets here."
                : "No assets yet. Upload some files to get started."
            }
          />
        </TabsContent>

        <TabsContent value="for-review">
          <AssetList
            items={forReviewItems}
            allItems={forReviewItems}
            view={view}
            selected={selected}
            toggleSelect={toggleSelect}
            toggleSelectAll={() => toggleSelectAll(forReviewItems)}
            downloadOne={downloadOne}
            onPlay={handleAssetClick}
            onTogglePublicReview={handleTogglePublicReview}
            emptyMessage="No assets marked for review yet."
          />
        </TabsContent>

        <TabsContent value="deliverables">
          <AssetList
            items={deliverableItems}
            allItems={deliverableItems}
            view={view}
            selected={selected}
            toggleSelect={toggleSelect}
            toggleSelectAll={() => toggleSelectAll(deliverableItems)}
            downloadOne={downloadOne}
            onPlay={handleAssetClick}
            onTogglePublicReview={handleTogglePublicReview}
            emptyMessage="No deliverables yet."
          />
        </TabsContent>
      </Tabs>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open)
          if (!open) setDroppedFiles([])
        }}
        project={projectId}
        folder={currentFolder ?? undefined}
        existingFileNames={folderAssets.map((a) => a.file_name)}
        initialFiles={droppedFiles.length > 0 ? droppedFiles : undefined}
        onComplete={() => mutateAssets()}
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
            onComplete={() => mutateAssets()}
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

      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        project={projectId!}
        onComplete={handleFolderCreated}
      />

      {currentFolder && currentFolderDoc && (
        <RenameFolderDialog
          open={renameFolderOpen}
          onOpenChange={setRenameFolderOpen}
          folderName={currentFolder}
          folderDisplayName={currentFolderDoc.folder_name}
          onComplete={handleFolderRenamed}
        />
      )}

      <MoveToFolderDialog
        open={moveToFolderOpen}
        onOpenChange={setMoveToFolderOpen}
        assetNames={Array.from(selected)}
        project={projectId!}
        currentFolder={currentFolder}
        onComplete={handleMoveToFolderComplete}
      />
    </div>
    </DropZoneOverlay>
  )
}

function SharePopover({
  asset,
  onToggle,
}: {
  asset: VMSAsset
  onToggle: (assetName: string, enable: boolean) => Promise<void>
}) {
  const [toggling, setToggling] = useState(false)
  const isPublic = asset.is_public_review === 1

  const shareUrl = asset.review_token
    ? `${window.location.origin}/vms/review/${asset.name}?token=${asset.review_token}`
    : ""

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success("Link copied to clipboard")
    } catch {
      toast.error("Failed to copy link")
    }
  }

  const handleToggle = async (checked: boolean) => {
    setToggling(true)
    try {
      await onToggle(asset.name, checked)
    } finally {
      setToggling(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        className={buttonVariants({ variant: "ghost", size: "icon-sm", className: isPublic ? "text-primary" : "" })}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        title="Share"
      >
        <HugeiconsIcon icon={Link01Icon} strokeWidth={2} size={14} />
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor={`share-toggle-${asset.name}`} className="text-sm font-medium">
              Public review link
            </Label>
            <Switch
              id={`share-toggle-${asset.name}`}
              checked={isPublic}
              onCheckedChange={handleToggle}
              disabled={toggling}
            />
          </div>
          {isPublic && shareUrl && (
            <div className="flex items-center gap-2">
              <Input
                value={shareUrl}
                readOnly
                className="text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button variant="outline" size="icon-sm" onClick={handleCopy}>
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} size={14} />
              </Button>
            </div>
          )}
          {isPublic && !shareUrl && (
            <p className="text-xs text-muted-foreground">Generating link...</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FolderCard({
  folder,
  view,
  onClick,
  onDrop,
}: {
  folder: VMSFolder
  view: "list" | "grid"
  onClick: () => void
  onDrop?: (assetNames: string[]) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/vms-assets")) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const data = e.dataTransfer.getData("application/vms-assets")
    if (!data) return
    try {
      const assetNames: string[] = JSON.parse(data)
      if (assetNames.length > 0) onDrop?.(assetNames)
    } catch { /* ignore */ }
  }

  const dropProps = onDrop ? {
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  } : {}

  const dropHighlight = dragOver ? "ring-2 ring-primary bg-primary/5" : ""

  if (view === "list") {
    return (
      <Card
        size="sm"
        className={`cursor-pointer transition-shadow hover:shadow-md ${dropHighlight}`}
        onClick={onClick}
        {...dropProps}
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-muted">
              <HugeiconsIcon icon={Folder02Icon} size={20} strokeWidth={1.5} className="text-muted-foreground" />
            </div>
            <CardTitle className="truncate text-sm">
              {folder.folder_name}
            </CardTitle>
          </div>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card
      className={`flex cursor-pointer flex-col overflow-hidden pt-0 transition-shadow hover:shadow-md ${dropHighlight}`}
      onClick={onClick}
      {...dropProps}
    >
      <div className="flex aspect-video w-full items-center justify-center bg-muted">
        <HugeiconsIcon icon={Folder02Icon} size={48} strokeWidth={1.5} className="text-muted-foreground/40" />
      </div>
      <CardHeader>
        <CardTitle className="truncate text-sm">
          {folder.folder_name}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

function BreadcrumbNav({
  projectName,
  folderName,
  onNavigateToRoot,
  onDropToRoot,
}: {
  projectName: string
  folderName: string
  onNavigateToRoot: () => void
  onDropToRoot: (assetNames: string[]) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/vms-assets")) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOver(true)
  }

  const handleDragLeave = () => { setDragOver(false) }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const data = e.dataTransfer.getData("application/vms-assets")
    if (!data) return
    try {
      const assetNames: string[] = JSON.parse(data)
      if (assetNames.length > 0) onDropToRoot(assetNames)
    } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <button
        onClick={onNavigateToRoot}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded px-1.5 py-0.5 transition-colors ${dragOver ? "bg-primary/10 text-primary ring-1 ring-primary" : "text-muted-foreground hover:text-foreground"}`}
      >
        {projectName}
      </button>
      <span className="text-muted-foreground">/</span>
      <span className="font-medium">{folderName}</span>
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
  onTogglePublicReview,
  emptyMessage,
  folders,
  onFolderClick,
  onDropToFolder,
  draggable: canDragProp,
}: {
  items: VMSAsset[]
  allItems: VMSAsset[]
  view: "list" | "grid"
  selected: Set<string>
  toggleSelect: (name: string) => void
  toggleSelectAll: () => void
  downloadOne: (assetName: string, fileName?: string) => void
  onPlay: (assetName: string) => void
  onTogglePublicReview: (assetName: string, enable: boolean) => Promise<void>
  emptyMessage: string
  folders?: VMSFolder[]
  onFolderClick?: (folderName: string) => void
  onDropToFolder?: (assetNames: string[], folderName: string) => void
  draggable?: boolean
}) {
  const canDrag = canDragProp ?? false

  const handleDragStart = (e: React.DragEvent, assetName: string) => {
    const dragNames = selected.has(assetName) && selected.size > 1
      ? Array.from(selected)
      : [assetName]
    e.dataTransfer.setData("application/vms-assets", JSON.stringify(dragNames))
    e.dataTransfer.effectAllowed = "move"

    // Create a small custom drag image so the browser doesn't capture
    // the full card (which can include surrounding UI in the ghost)
    const label = dragNames.length === 1
      ? (items.find((a) => a.name === dragNames[0])?.file_name ?? "1 item")
      : `${dragNames.length} items`
    const ghost = document.createElement("div")
    ghost.textContent = label
    Object.assign(ghost.style, {
      position: "absolute",
      top: "-9999px",
      left: "-9999px",
      padding: "6px 12px",
      borderRadius: "6px",
      background: "hsl(var(--primary))",
      color: "hsl(var(--primary-foreground))",
      fontSize: "13px",
      fontWeight: "500",
      whiteSpace: "nowrap",
      pointerEvents: "none",
    })
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    // Delay removal so the browser captures the ghost for the drag layer
    setTimeout(() => ghost.remove(), 100)
  }

  const hasFolders = folders && folders.length > 0
  const hasItems = items.length > 0

  if (!hasFolders && !hasItems) {
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
      {hasItems && (
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
      )}

      {view === "list" ? (
        <div className="space-y-2">
          {hasFolders && folders.map((folder) => (
            <FolderCard
              key={folder.name}
              folder={folder}
              view="list"
              onClick={() => onFolderClick?.(folder.name)}
              onDrop={onDropToFolder ? (names) => onDropToFolder(names, folder.name) : undefined}
            />
          ))}
          {items.map((asset) => (
            <Card
              key={asset.name}
              size="sm"
              className="cursor-pointer transition-shadow hover:shadow-md"
              draggable={canDrag}
              onDragStart={canDrag ? (e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, asset.name) : undefined}
              onClick={() => {
                if (asset.status === "Ready") onPlay(asset.name)
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
                  <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-muted">
                    {asset.thumbnail_url ? (
                      <img src={asset.thumbnail_url} alt="" draggable={false} className="h-full w-full object-cover" />
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
                        <>
                          <SharePopover asset={asset} onToggle={onTogglePublicReview} />
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
                        </>
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
          {hasFolders && folders.map((folder) => (
            <FolderCard
              key={folder.name}
              folder={folder}
              view="grid"
              onClick={() => onFolderClick?.(folder.name)}
              onDrop={onDropToFolder ? (names) => onDropToFolder(names, folder.name) : undefined}
            />
          ))}
          {items.map((asset) => (
            <Card
              key={asset.name}
              className="flex cursor-pointer flex-col overflow-hidden pt-0 transition-shadow hover:shadow-md"
              draggable={canDrag}
              onDragStart={canDrag ? (e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, asset.name) : undefined}
              onClick={() => {
                if (asset.status === "Ready") onPlay(asset.name)
              }}
            >
              <div className="aspect-video w-full bg-muted">
                {asset.thumbnail_url ? (
                  <img src={asset.thumbnail_url} alt="" draggable={false} className="h-full w-full object-cover" />
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
                  <div className="flex items-center gap-1">
                    {asset.status === "Ready" && (
                      <>
                        <SharePopover asset={asset} onToggle={onTogglePublicReview} />
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
                      </>
                    )}
                  </div>
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
  )
}
