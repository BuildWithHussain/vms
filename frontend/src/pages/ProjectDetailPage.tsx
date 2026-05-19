import { useState, useMemo, useCallback } from "react"
import { useSelection } from "@/hooks/useSelection"
import { useParams, useNavigate } from "react-router"
import { useFrappeGetDoc, useFrappeGetDocList, useFrappeGetCall, useFrappePostCall, useFrappeEventListener } from "frappe-react-sdk"
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
  ListViewIcon,
  Copy01Icon,
  MoreVerticalIcon,
  PencilEdit01Icon,
  Share01Icon,
} from "@hugeicons/core-free-icons"
import { Badge } from "@/components/ui/badge"
import { cn, formatBytes } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AssetDropdownMenu, AssetContextMenu } from "@/components/AssetCardMenu"
import type { AssetMenuActions } from "@/components/AssetCardMenu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useUploadContext } from "@/contexts/UploadContext"
import { DeleteAssetDialog } from "@/components/DeleteAssetDialog"
import { RenameAssetDialog } from "@/components/RenameAssetDialog"
import { MediaPlayerDialog } from "@/components/MediaPlayerDialog"
import { CreateFolderDialog } from "@/components/CreateFolderDialog"
import { RenameFolderDialog } from "@/components/RenameFolderDialog"
import { MoveToFolderDialog } from "@/components/MoveToFolderDialog"
import { DeleteFolderDialog } from "@/components/DeleteFolderDialog"
import { DropZoneOverlay } from "@/components/DropZoneOverlay"
import { CategoryBadge } from "@/components/CategoryBadge"
import { AssetTags } from "@/components/AssetTags"
import { AssetTagFilter } from "@/components/AssetTagFilter"
import { AssetCardColor, CARD_COLOR_BORDER_CLASS } from "@/components/AssetCardColor"
import { useDownload } from "@/hooks/useDownload"
import { UserAvatar } from "@/components/UserAvatar"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Files01Icon, FilmRoll01Icon, DeliveryBox01Icon, FolderOpenIcon } from "@hugeicons/core-free-icons"
import type { VMSProject, VMSAsset, VMSFolder } from "@/types"

const PAGE_SIZE = 20

interface PaginatedAssets {
  assets: VMSAsset[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export function ProjectDetailPage() {
  const { projectId, folderId } = useParams()
  const navigate = useNavigate()
  const currentFolder = folderId ?? null
  const { openUpload } = useUploadContext()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [moveToFolderOpen, setMoveToFolderOpen] = useState(false)
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false)
  const [previewAsset, setPreviewAsset] = useState<VMSAsset | null>(null)
  const [folderToAction, setFolderToAction] = useState<VMSFolder | null>(null)
  const [cardRenameFolderOpen, setCardRenameFolderOpen] = useState(false)
  const [cardDeleteFolderOpen, setCardDeleteFolderOpen] = useState(false)
  const [view, setView] = useState<"list" | "grid">("grid")
  const { selected, toggleSelect, toggleSelectAll, clearSelection } = useSelection()
  const [activeTab, setActiveTab] = useState("all")
  const [page, setPage] = useState(1)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const { downloadOne, downloadMany, isDownloading } = useDownload()

  const { call: callTogglePublicReview } = useFrappePostCall("vms.review_api.toggle_public_review")

  const { call: callMoveToFolder } = useFrappePostCall("vms.api.move_assets_to_folder")
  const { call: callEnableSharing } = useFrappePostCall("vms.api.enable_project_sharing")
  const { call: callDisableSharing } = useFrappePostCall("vms.api.disable_project_sharing")
  const { call: callConvertToMp4 } = useFrappePostCall("vms.api.convert_asset_to_mp4")

  const { data: project, mutate: mutateProject } = useFrappeGetDoc<VMSProject>(
    "VMS Project",
    projectId!
  )

  const { data: folderAssetsData, mutate: mutateFolderAssets, isLoading: isLoadingFolder } = useFrappeGetCall<{ message: PaginatedAssets }>(
    "vms.api.get_project_assets",
    { project: projectId!, folder: currentFolder ?? undefined, tag: tagFilter ?? undefined, page: activeTab === "all" ? page : 1, page_size: PAGE_SIZE },
    `project-assets-folder-${projectId}-${currentFolder ?? "root"}-t${tagFilter ?? ""}-p${activeTab === "all" ? page : 1}`,
  )

  const { data: forReviewData, mutate: mutateForReview, isLoading: isLoadingForReview } = useFrappeGetCall<{ message: PaginatedAssets }>(
    "vms.api.get_project_assets",
    { project: projectId!, category: "For Review", tag: tagFilter ?? undefined, page: activeTab === "for-review" ? page : 1, page_size: PAGE_SIZE },
    `project-assets-review-${projectId}-t${tagFilter ?? ""}-p${activeTab === "for-review" ? page : 1}`,
  )

  const { data: deliverablesData, mutate: mutateDeliverables, isLoading: isLoadingDeliverables } = useFrappeGetCall<{ message: PaginatedAssets }>(
    "vms.api.get_project_assets",
    { project: projectId!, category: "Deliverable", tag: tagFilter ?? undefined, page: activeTab === "deliverables" ? page : 1, page_size: PAGE_SIZE },
    `project-assets-deliverables-${projectId}-t${tagFilter ?? ""}-p${activeTab === "deliverables" ? page : 1}`,
  )

  const folderAssets = folderAssetsData?.message?.assets ?? []
  const folderTotal = folderAssetsData?.message?.total ?? 0
  const folderTotalPages = folderAssetsData?.message?.total_pages ?? 1
  const forReviewItems = forReviewData?.message?.assets ?? []
  const forReviewTotal = forReviewData?.message?.total ?? 0
  const forReviewTotalPages = forReviewData?.message?.total_pages ?? 1
  const deliverableItems = deliverablesData?.message?.assets ?? []
  const deliverableTotal = deliverablesData?.message?.total ?? 0
  const deliverableTotalPages = deliverablesData?.message?.total_pages ?? 1

  const mutateAssets = useCallback(() => {
    mutateFolderAssets()
    mutateForReview()
    mutateDeliverables()
  }, [mutateFolderAssets, mutateForReview, mutateDeliverables])

  const handleUploadNewVersion = useCallback((asset: VMSAsset) => {
    openUpload({
      versionOf: asset,
      project: asset.project,
      category: asset.category,
      onComplete: () => mutateAssets(),
    })
  }, [openUpload, mutateAssets])

  const { data: folders, mutate: mutateFolders } = useFrappeGetDocList<VMSFolder>("VMS Folder", {
    fields: ["name", "folder_name", "creation"],
    filters: [["project", "=", projectId!], ["deleted_at", "is", "not set"]],
    orderBy: { field: "folder_name", order: "asc" },
    limit: 100,
  })

  const currentFolderDoc = useMemo(
    () => (folders ?? []).find((f) => f.name === currentFolder) ?? null,
    [folders, currentFolder],
  )

  // Folder in URL but doesn't exist (deleted or invalid)
  const folderNotFound = !!currentFolder && !currentFolderDoc && !!folders

  // Listen for asset conversion completion to refresh the list
  useFrappeEventListener<{
    asset_name: string
    status: string
    error_message?: string
  }>("asset_conversion_progress", useCallback((data) => {
    if (data.status === "Ready") {
      toast.success("Conversion complete", { description: "Asset has been converted to MP4." })
      mutateAssets()
    } else if (data.status === "Error") {
      toast.error("Conversion failed", { description: data.error_message || "An error occurred during conversion." })
      mutateAssets()
    }
  }, [mutateAssets]))

  const handleConvertToMp4 = useCallback(
    async (assetName: string) => {
      try {
        await callConvertToMp4({ asset_name: assetName })
        toast("Converting to MP4...", { description: "The file will be converted in the background." })
        mutateAssets()
      } catch {
        toast.error("Failed to start conversion")
      }
    },
    [callConvertToMp4, mutateAssets],
  )

  const handleTogglePublicReview = useCallback(
    async (assetName: string, enable: boolean) => {
      await callTogglePublicReview({ asset_name: assetName, enable: enable ? 1 : 0 })
      mutateAssets()
    },
    [callTogglePublicReview, mutateAssets],
  )

  const allAssets = useMemo(
    () => [...folderAssets, ...forReviewItems, ...deliverableItems].filter(
      (a, i, arr) => arr.findIndex((b) => b.name === a.name) === i,
    ),
    [folderAssets, forReviewItems, deliverableItems],
  )

  const imageSiblings = useMemo(
    () => allAssets.filter((a) => a.status === "Ready" && a.file_type?.startsWith("image/")),
    [allAssets],
  )

  const handleBulkDownload = () => {
    const toDownload = allAssets.filter((a) => selected.has(a.name))
    downloadMany(toDownload)
  }

  const handleAssetClick = useCallback(
    (assetName: string) => {
      const asset = allAssets.find((a) => a.name === assetName)
      if (!asset || asset.status !== "Ready") return
      if (asset.file_type?.startsWith("video/")) {
        navigate(`/review/${assetName}`)
      } else {
        setPreviewAsset(asset)
      }
    },
    [allAssets, navigate],
  )

  const handleDeleteComplete = () => {
    clearSelection()
    mutateAssets()
  }

  const handleFolderClick = (folderName: string) => {
    navigate(`/projects/${projectId}/folder/${folderName}`)
    setPage(1)
    clearSelection()
  }

  const handleNavigateToRoot = () => {
    navigate(`/projects/${projectId}`)
    setPage(1)
    clearSelection()
  }

  const handleDeleteFolder = () => {
    if (!currentFolder) return
    setDeleteFolderOpen(true)
  }

  const handleDeleteFolderComplete = () => {
    navigate(`/projects/${projectId}`, { replace: true })
    mutateFolders()
    mutateAssets()
  }

  const handleMoveToFolderComplete = () => {
    clearSelection()
    mutateAssets()
  }

  const handlePageDrop = useCallback((files: File[]) => {
    openUpload({
      project: projectId,
      folder: currentFolder ?? undefined,
      existingFileNames: folderAssets.filter((a: VMSAsset) => a.status === "Ready").map((a: VMSAsset) => a.file_name),
      initialFiles: files,
      onComplete: () => mutateAssets(),
    })
  }, [openUpload, projectId, currentFolder, folderAssets, mutateAssets])

  const openProjectUpload = useCallback(() => {
    openUpload({
      project: projectId,
      folder: currentFolder ?? undefined,
      existingFileNames: folderAssets.filter((a: VMSAsset) => a.status === "Ready").map((a: VMSAsset) => a.file_name),
      onComplete: () => mutateAssets(),
    })
  }, [openUpload, projectId, currentFolder, folderAssets, mutateAssets])

  const handleFolderCreated = () => {
    mutateFolders()
    mutateAssets()
  }

  const handleFolderRenamed = () => {
    mutateFolders()
    mutateAssets()
  }

  const handleDropToFolder = useCallback(
    async (assetNames: string[], folderName: string | null) => {
      try {
        await callMoveToFolder({ asset_names: JSON.stringify(assetNames), folder: folderName })
        toast.success(`Moved ${assetNames.length} ${assetNames.length === 1 ? "asset" : "assets"}`)
        clearSelection()
        mutateAssets()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to move assets"
        toast.error(message)
      }
    },
    [callMoveToFolder, mutateAssets],
  )

  // Individual asset menu handlers (select one asset, open dialog)
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

  const handleMenuMoveToFolder = useCallback(
    (asset: VMSAsset) => {
      clearSelection()
      toggleSelect(asset.name)
      setMoveToFolderOpen(true)
    },
    [clearSelection, toggleSelect],
  )

  const handleMenuCopyShareLink = useCallback(
    async (asset: VMSAsset) => {
      if (asset.is_public_review === 1 && asset.review_token) {
        const url = `${window.location.origin}/vms/review/${asset.name}?token=${asset.review_token}`
        try {
          await navigator.clipboard.writeText(url)
          toast.success("Link copied to clipboard")
        } catch {
          toast.error("Failed to copy link")
        }
      }
    },
    [],
  )

  const handleMenuToggleSharing = useCallback(
    async (asset: VMSAsset) => {
      const enable = asset.is_public_review !== 1
      await handleTogglePublicReview(asset.name, enable)
      toast.success(enable ? "Public link enabled" : "Public link disabled")
    },
    [handleTogglePublicReview],
  )

  const handleCardFolderRename = useCallback((folder: VMSFolder) => {
    setFolderToAction(folder)
    setCardRenameFolderOpen(true)
  }, [])

  const handleCardFolderDelete = useCallback((folder: VMSFolder) => {
    setFolderToAction(folder)
    setCardDeleteFolderOpen(true)
  }, [])

  const handleCardFolderRenameComplete = () => {
    mutateFolders()
    mutateAssets()
    setFolderToAction(null)
  }

  const handleCardFolderDeleteComplete = () => {
    mutateFolders()
    mutateAssets()
    setFolderToAction(null)
  }

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
            <ProjectSharePopover
              project={project}
              onEnable={callEnableSharing}
              onDisable={callDisableSharing}
              onMutate={mutateProject}
            />
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

      {/* Folder not found */}
      {currentFolder && !currentFolderDoc && folders && (
        <div className="space-y-4">
          <BreadcrumbNav
            projectName={project.project_name}
            folderName="..."
            onNavigateToRoot={handleNavigateToRoot}
            onDropToRoot={() => {}}
          />
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Folder02Icon} strokeWidth={1.5} />
              </EmptyMedia>
              <EmptyTitle>Folder not found</EmptyTitle>
              <EmptyDescription>This folder may have been deleted or moved.</EmptyDescription>
            </EmptyHeader>
            <Button size="sm" variant="outline" onClick={handleNavigateToRoot}>
              Back to project
            </Button>
          </Empty>
        </div>
      )}

      {!folderNotFound && <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1); clearSelection() }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="all">
              All{folderTotal > 0 ? ` (${folderTotal})` : ""}
            </TabsTrigger>
            <TabsTrigger value="for-review">
              For Review{forReviewTotal > 0 ? ` (${forReviewTotal})` : ""}
            </TabsTrigger>
            <TabsTrigger value="deliverables">
              Deliverables{deliverableTotal > 0 ? ` (${deliverableTotal})` : ""}
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
            <AssetTagFilter
              project={projectId!}
              value={tagFilter}
              onChange={(t) => { setTagFilter(t); setPage(1); clearSelection() }}
            />
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
            <Button size="sm" onClick={() => openProjectUpload()}>
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
            onCategoryChanged={() => mutateAssets()}
            onConvert={handleConvertToMp4}
            onUploadNewVersion={handleUploadNewVersion}
            onRename={handleMenuRename}
            onDelete={handleMenuDelete}
            onMoveToFolder={handleMenuMoveToFolder}
            onCopyShareLink={handleMenuCopyShareLink}
            onToggleSharing={handleMenuToggleSharing}
            folders={currentFolder || tagFilter ? undefined : folders ?? undefined}
            onFolderClick={handleFolderClick}
            onFolderRename={currentFolder || tagFilter ? undefined : handleCardFolderRename}
            onFolderDelete={currentFolder || tagFilter ? undefined : handleCardFolderDelete}
            onDropToFolder={currentFolder || tagFilter ? undefined : handleDropToFolder}
            draggable={(folders ?? []).length > 0 || !!currentFolder}
            isLoading={isLoadingFolder}
            emptyMessage={
              currentFolder ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={1.5} />
                    </EmptyMedia>
                    <EmptyTitle>Folder is empty</EmptyTitle>
                    <EmptyDescription>Upload files or move assets into this folder.</EmptyDescription>
                  </EmptyHeader>
                  <Button size="sm" onClick={() => openProjectUpload()}>
                    <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.5} data-icon="inline-start" />
                    Upload
                  </Button>
                </Empty>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HugeiconsIcon icon={Files01Icon} strokeWidth={1.5} />
                    </EmptyMedia>
                    <EmptyTitle>No assets yet</EmptyTitle>
                    <EmptyDescription>Upload some files to get started.</EmptyDescription>
                  </EmptyHeader>
                  <Button size="sm" onClick={() => openProjectUpload()}>
                    <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.5} data-icon="inline-start" />
                    Upload
                  </Button>
                </Empty>
              )
            }
          />
          <PaginationControls page={page} totalPages={folderTotalPages} onPageChange={setPage} />
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
            onCategoryChanged={() => mutateAssets()}
            onConvert={handleConvertToMp4}
            onUploadNewVersion={handleUploadNewVersion}
            onRename={handleMenuRename}
            onDelete={handleMenuDelete}
            onMoveToFolder={handleMenuMoveToFolder}
            onCopyShareLink={handleMenuCopyShareLink}
            onToggleSharing={handleMenuToggleSharing}
            isLoading={isLoadingForReview}
            emptyMessage={
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={FilmRoll01Icon} strokeWidth={1.5} />
                  </EmptyMedia>
                  <EmptyTitle>No assets for review</EmptyTitle>
                  <EmptyDescription>Mark assets as "For Review" to see them here.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            }
          />
          <PaginationControls page={page} totalPages={forReviewTotalPages} onPageChange={setPage} />
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
            onCategoryChanged={() => mutateAssets()}
            onConvert={handleConvertToMp4}
            onUploadNewVersion={handleUploadNewVersion}
            onRename={handleMenuRename}
            onDelete={handleMenuDelete}
            onMoveToFolder={handleMenuMoveToFolder}
            onCopyShareLink={handleMenuCopyShareLink}
            onToggleSharing={handleMenuToggleSharing}
            isLoading={isLoadingDeliverables}
            emptyMessage={
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={DeliveryBox01Icon} strokeWidth={1.5} />
                  </EmptyMedia>
                  <EmptyTitle>No deliverables yet</EmptyTitle>
                  <EmptyDescription>Mark assets as "Deliverable" to see them here.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            }
          />
          <PaginationControls page={page} totalPages={deliverableTotalPages} onPageChange={setPage} />
        </TabsContent>
      </Tabs>}


      <DeleteAssetDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        assetNames={Array.from(selected)}
        onComplete={handleDeleteComplete}
      />

      {selected.size === 1 && (() => {
        const selectedAsset = allAssets.find((a) => a.name === Array.from(selected)[0])
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
        siblings={previewAsset?.file_type?.startsWith("image/") ? imageSiblings : undefined}
        onNavigate={setPreviewAsset}
      />

      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        project={projectId!}
        onComplete={handleFolderCreated}
      />

      {currentFolder && currentFolderDoc && (
        <>
          <RenameFolderDialog
            open={renameFolderOpen}
            onOpenChange={setRenameFolderOpen}
            folderName={currentFolder}
            folderDisplayName={currentFolderDoc.folder_name}
            onComplete={handleFolderRenamed}
          />
          <DeleteFolderDialog
            open={deleteFolderOpen}
            onOpenChange={setDeleteFolderOpen}
            folderName={currentFolder}
            folderDisplayName={currentFolderDoc.folder_name}
            onComplete={handleDeleteFolderComplete}
          />
        </>
      )}

      {folderToAction && (
        <>
          <RenameFolderDialog
            open={cardRenameFolderOpen}
            onOpenChange={setCardRenameFolderOpen}
            folderName={folderToAction.name}
            folderDisplayName={folderToAction.folder_name}
            onComplete={handleCardFolderRenameComplete}
          />
          <DeleteFolderDialog
            open={cardDeleteFolderOpen}
            onOpenChange={setCardDeleteFolderOpen}
            folderName={folderToAction.name}
            folderDisplayName={folderToAction.folder_name}
            onComplete={handleCardFolderDeleteComplete}
          />
        </>
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

function ProjectSharePopover({
  project,
  onEnable,
  onDisable,
  onMutate,
}: {
  project: VMSProject
  onEnable: (args: { project: string }) => Promise<{ message: { share_token: string; share_url: string } }>
  onDisable: (args: { project: string }) => Promise<unknown>
  onMutate: () => void
}) {
  const [toggling, setToggling] = useState(false)
  const isShared = !!project.share_token

  const shareUrl = project.share_token
    ? `${window.location.origin}/vms/shared/${project.name}?token=${project.share_token}`
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
      if (checked) {
        await onEnable({ project: project.name })
      } else {
        await onDisable({ project: project.name })
      }
      onMutate()
    } catch {
      toast.error("Failed to update sharing")
    } finally {
      setToggling(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        className={buttonVariants({ variant: "ghost", size: "icon-sm", className: isShared ? "text-primary" : "" })}
        title="Share project"
      >
        <HugeiconsIcon icon={Share01Icon} strokeWidth={2} size={16} />
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="project-share-toggle" className="text-sm font-medium">
              Public share link
            </Label>
            <Switch
              id="project-share-toggle"
              checked={isShared}
              onCheckedChange={handleToggle}
              disabled={toggling}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Anyone with this link can view all assets in this project.
          </p>
          {isShared && shareUrl && (
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
  onRename,
  onDelete,
}: {
  folder: VMSFolder
  view: "list" | "grid"
  onClick: () => void
  onDrop?: (assetNames: string[]) => void
  onRename?: () => void
  onDelete?: () => void
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

  const hasMenu = !!onRename || !!onDelete

  const menuContent = hasMenu ? (
    <>
      {onRename && (
        <ContextMenuItem onClick={(e) => { e.stopPropagation(); onRename() }}>
          <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
          Rename
        </ContextMenuItem>
      )}
      {onRename && onDelete && <ContextMenuSeparator />}
      {onDelete && (
        <ContextMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); onDelete() }}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          Delete
        </ContextMenuItem>
      )}
    </>
  ) : null

  const dropdownMenu = hasMenu ? (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {onRename && (
            <DropdownMenuItem onClick={onRename}>
              <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
              Rename
            </DropdownMenuItem>
          )}
          {onRename && onDelete && <DropdownMenuSeparator />}
          {onDelete && (
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : null

  if (view === "list") {
    const listCard = (
      <Card
        size="sm"
        className={`cursor-pointer transition-shadow hover:shadow-md ${dropHighlight}`}
        onClick={onClick}
        {...dropProps}
      >
        <CardHeader>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-muted">
              <HugeiconsIcon icon={Folder02Icon} size={20} strokeWidth={1.5} className="text-muted-foreground" />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <CardTitle className="truncate text-sm">
                {folder.folder_name}
              </CardTitle>
              {dropdownMenu}
            </div>
          </div>
        </CardHeader>
      </Card>
    )

    if (!hasMenu) return listCard

    return (
      <ContextMenu>
        <ContextMenuTrigger className="flex flex-col">
          {listCard}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {menuContent}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  const gridCard = (
    <Card
      className={`flex cursor-pointer flex-col overflow-hidden pt-0 transition-shadow hover:shadow-md ${dropHighlight}`}
      onClick={onClick}
      {...dropProps}
    >
      <div className="flex aspect-video w-full items-center justify-center bg-muted">
        <HugeiconsIcon icon={Folder02Icon} size={48} strokeWidth={1.5} className="text-muted-foreground/40" />
      </div>
      <CardHeader>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <CardTitle className="truncate text-sm">
            {folder.folder_name}
          </CardTitle>
          {dropdownMenu}
        </div>
      </CardHeader>
    </Card>
  )

  if (!hasMenu) return gridCard

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex flex-col">
        {gridCard}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menuContent}
      </ContextMenuContent>
    </ContextMenu>
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

function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-end gap-2 pt-4">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
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
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </div>
  )
}

const VIDEO_EXTENSIONS = new Set([".mkv", ".avi", ".wmv", ".flv", ".webm", ".mov", ".ts", ".m4v"])

function isConvertibleToMp4(asset: VMSAsset): boolean {
  if (asset.status !== "Ready" || asset.file_type === "video/mp4") return false
  if (asset.file_type?.startsWith("video/")) return true
  // .mkv etc. often get application/octet-stream — check extension
  const ext = asset.file_name.toLowerCase().match(/\.[^.]+$/)?.[0]
  return ext ? VIDEO_EXTENSIONS.has(ext) : false
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
  onCategoryChanged,
  onConvert,
  onUploadNewVersion,
  onRename,
  onDelete,
  onMoveToFolder,
  onCopyShareLink,
  onToggleSharing,
  emptyMessage,
  folders,
  onFolderClick,
  onFolderRename,
  onFolderDelete,
  onDropToFolder,
  draggable: canDragProp,
  isLoading,
}: {
  items: VMSAsset[]
  allItems: VMSAsset[]
  view: "list" | "grid"
  selected: Set<string>
  toggleSelect: (name: string) => void
  toggleSelectAll: () => void
  downloadOne: (assetName: string, fileName?: string) => void
  onPlay: (assetName: string) => void
  onCategoryChanged?: () => void
  onConvert?: (assetName: string) => void
  onUploadNewVersion?: (asset: VMSAsset) => void
  onRename?: (asset: VMSAsset) => void
  onDelete?: (asset: VMSAsset) => void
  onMoveToFolder?: (asset: VMSAsset) => void
  onCopyShareLink?: (asset: VMSAsset) => void
  onToggleSharing?: (asset: VMSAsset) => void
  emptyMessage: React.ReactNode
  folders?: VMSFolder[]
  onFolderClick?: (folderName: string) => void
  onFolderRename?: (folder: VMSFolder) => void
  onFolderDelete?: (folder: VMSFolder) => void
  onDropToFolder?: (assetNames: string[], folderName: string) => void
  draggable?: boolean
  isLoading?: boolean
}) {
  const canDrag = canDragProp ?? false

  const menuActions: AssetMenuActions = {
    onOpen: (asset) => onPlay(asset.name),
    onDownload: (asset) => downloadOne(asset.name, asset.file_name),
    onConvert: onConvert ? (asset) => onConvert(asset.name) : undefined,
    onUploadNewVersion,
    onRename,
    onDelete,
    onMoveToFolder,
    onCopyShareLink,
    onToggleSharing,
  }

  const handleDragStart = (e: React.DragEvent, assetName: string) => {
    const dragNames = selected.has(assetName) && selected.size > 1
      ? Array.from(selected)
      : [assetName]
    e.dataTransfer.setData("application/vms-assets", JSON.stringify(dragNames))
    e.dataTransfer.effectAllowed = "move"

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
    setTimeout(() => ghost.remove(), 100)
  }

  const hasFolders = folders && folders.length > 0
  const hasItems = items.length > 0

  if (isLoading && !hasItems) {
    return view === "list" ? (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} size="sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-16 shrink-0 rounded" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    ) : (
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
    )
  }

  if (!hasFolders && !hasItems) {
    return <>{emptyMessage}</>
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
              onRename={onFolderRename ? () => onFolderRename(folder) : undefined}
              onDelete={onFolderDelete ? () => onFolderDelete(folder) : undefined}
            />
          ))}
          {items.map((asset) => (
            <AssetContextMenu key={asset.name} asset={asset} actions={menuActions} isConvertible={isConvertibleToMp4(asset)}>
              <Card
                size="sm"
                className={cn(
                  "cursor-pointer transition-shadow hover:shadow-md",
                  asset.card_color && CARD_COLOR_BORDER_CLASS[asset.card_color],
                )}
                draggable={canDrag}
                onDragStart={canDrag ? (e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, asset.name) : undefined}
                onClick={() => {
                  if (asset.status === "Ready") onPlay(asset.name)
                }}
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
                        <img src={asset.thumbnail_url} alt="" draggable={false} className="h-full w-full object-cover" />
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
                          onChanged={onCategoryChanged}
                        />
                        <Badge
                          variant={
                            asset.status === "Ready" ? "secondary" : "outline"
                          }
                        >
                          {asset.status}
                        </Badge>
                        <AssetCardColor
                          assetName={asset.name}
                          color={asset.card_color}
                          onChanged={onCategoryChanged}
                        />
                        <div onClick={(e) => e.stopPropagation()}>
                          <AssetDropdownMenu
                            asset={asset}
                            actions={menuActions}
                            isConvertible={isConvertibleToMp4(asset)}
                          />
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
                    onChanged={onCategoryChanged}
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
          {hasFolders && folders.map((folder) => (
            <FolderCard
              key={folder.name}
              folder={folder}
              view="grid"
              onClick={() => onFolderClick?.(folder.name)}
              onDrop={onDropToFolder ? (names) => onDropToFolder(names, folder.name) : undefined}
              onRename={onFolderRename ? () => onFolderRename(folder) : undefined}
              onDelete={onFolderDelete ? () => onFolderDelete(folder) : undefined}
            />
          ))}
          {items.map((asset) => (
            <AssetContextMenu key={asset.name} asset={asset} actions={menuActions} isConvertible={isConvertibleToMp4(asset)}>
              <Card
                className={cn(
                  "flex cursor-pointer flex-col overflow-hidden pt-0 transition-shadow hover:shadow-md",
                  asset.card_color && CARD_COLOR_BORDER_CLASS[asset.card_color],
                )}
                draggable={canDrag}
                onDragStart={canDrag ? (e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, asset.name) : undefined}
                onClick={() => {
                  if (asset.status === "Ready") onPlay(asset.name)
                }}
              >
                <div className="flex aspect-video w-full items-center justify-center bg-muted">
                  {asset.thumbnail_url ? (
                    <img src={asset.thumbnail_url} alt="" draggable={false} className="h-full w-full object-contain" />
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
                    <div className="flex shrink-0 items-center gap-0.5">
                      <AssetCardColor
                        assetName={asset.name}
                        color={asset.card_color}
                        onChanged={onCategoryChanged}
                      />
                      <div onClick={(e) => e.stopPropagation()}>
                        <AssetDropdownMenu
                          asset={asset}
                          actions={menuActions}
                          isConvertible={isConvertibleToMp4(asset)}
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="mt-auto space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    <CategoryBadge
                      assetName={asset.name}
                      category={asset.category}
                      onChanged={onCategoryChanged}
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
                    onChanged={onCategoryChanged}
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
    </div>
  )
}
