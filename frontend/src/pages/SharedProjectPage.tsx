import { useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { Download04Icon, Film01Icon, ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { formatBytes } from "@/lib/utils"
import { toast } from "sonner"

interface SharedProject {
  name: string
  project_name: string
  status: string
  description?: string
  thumbnail_url?: string
}

interface SharedAsset {
  name: string
  file_name: string
  category: string
  file_size?: number
  file_type?: string
  uploaded_at?: string
  creation: string
  thumbnail_url?: string
}

interface PaginatedAssets {
  assets: SharedAsset[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

const PAGE_SIZE = 20

export function SharedProjectPage() {
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  const [page, setPage] = useState(1)

  const { data: projectData, isLoading: projectLoading, error: projectError } = useFrappeGetCall<{ message: SharedProject }>(
    "vms.api.get_shared_project",
    { project: projectId!, token: token ?? "" },
    token ? `shared-project-${projectId}` : undefined,
  )

  const { data: assetsData, isLoading: assetsLoading } = useFrappeGetCall<{ message: PaginatedAssets }>(
    "vms.api.get_shared_project_assets",
    { project: projectId!, token: token ?? "", page, page_size: PAGE_SIZE },
    token ? `shared-assets-${projectId}-p${page}` : undefined,
  )

  const project = projectData?.message
  const assets = assetsData?.message?.assets ?? []
  const total = assetsData?.message?.total ?? 0
  const totalPages = assetsData?.message?.total_pages ?? 1

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Invalid share link</h1>
          <p className="mt-2 text-muted-foreground">This link is missing a share token.</p>
        </div>
      </div>
    )
  }

  if (projectError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Link expired or invalid</h1>
          <p className="mt-2 text-muted-foreground">This share link is no longer valid.</p>
        </div>
      </div>
    )
  }

  if (projectLoading || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        {/* Header */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold md:text-3xl">{project.project_name}</h1>
            <Badge variant="outline">{project.status}</Badge>
          </div>
          {project.description && (
            <div
              className="prose prose-sm max-w-none text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: project.description }}
            />
          )}
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "file" : "files"} shared
          </p>
        </div>

        {/* Asset Grid */}
        {assetsLoading && assets.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="flex flex-col overflow-hidden pt-0">
                <Skeleton className="aspect-video w-full rounded-none" />
                <CardHeader>
                  <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent className="mt-auto space-y-2">
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : assets.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No files in this project.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assets.map((asset) => (
              <SharedAssetCard
                key={asset.name}
                asset={asset}
                projectId={projectId!}
                token={token}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} data-icon="inline-start" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
            </Button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 border-t pt-4 text-center text-xs text-muted-foreground">
          Shared via VMS
        </div>
      </div>
    </div>
  )
}

function SharedAssetCard({
  asset,
  projectId,
  token,
}: {
  asset: SharedAsset
  projectId: string
  token: string
}) {
  const [downloading, setDownloading] = useState(false)
  const { call: callDownload } = useFrappePostCall("vms.api.get_shared_asset_download_url")

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await callDownload({ asset_name: asset.name, project: projectId, token })
      const url = (res as { message: { url: string } }).message.url
      const a = document.createElement("a")
      a.href = url
      a.download = asset.file_name
      a.click()
    } catch {
      toast.error("Failed to download file")
    } finally {
      setDownloading(false)
    }
  }

  const isVideo = asset.file_type?.startsWith("video/")

  return (
    <Card className="group flex flex-col overflow-hidden pt-0">
      <div className="relative flex aspect-video items-center justify-center bg-muted">
        {asset.thumbnail_url ? (
          <img
            src={asset.thumbnail_url}
            alt={asset.file_name}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <HugeiconsIcon icon={Film01Icon} strokeWidth={1.5} size={32} className="text-muted-foreground" />
          </div>
        )}
        {isVideo && (
          <Badge variant="secondary" className="absolute bottom-2 left-2 text-[10px]">
            Video
          </Badge>
        )}
      </div>
      <CardHeader className="pb-2">
        <p className="truncate text-sm font-medium" title={asset.file_name}>
          {asset.file_name}
        </p>
      </CardHeader>
      <CardContent className="mt-auto flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {asset.file_size && <span>{formatBytes(asset.file_size)}</span>}
          <Badge variant="outline" className="text-[10px]">{asset.category}</Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleDownload}
          disabled={downloading}
          title="Download"
        >
          <HugeiconsIcon icon={Download04Icon} strokeWidth={2} size={14} />
        </Button>
      </CardContent>
    </Card>
  )
}
