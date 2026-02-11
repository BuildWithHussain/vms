import { useNavigate } from "react-router"
import { useFrappeGetDocList, useFrappeGetDocCount, useFrappePostCall } from "frappe-react-sdk"
import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatBytes } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import type { VMSProject, VMSAsset } from "@/types"

export function DashboardPage() {
  const navigate = useNavigate()

  const { data: projects } = useFrappeGetDocList<VMSProject>("VMS Project", {
    fields: ["name", "project_name", "status", "creation"],
    orderBy: { field: "creation", order: "desc" },
    limit: 5,
  })

  const { data: recentAssets } = useFrappeGetDocList<VMSAsset>("VMS Asset", {
    fields: ["name", "file_name", "category", "status", "project", "creation"],
    orderBy: { field: "creation", order: "desc" },
    limit: 5,
  })

  const { data: inboxCount } = useFrappeGetDocCount("VMS Asset", [
    ["project", "=", ""],
  ])

  const { data: openCount } = useFrappeGetDocCount("VMS Project", [
    ["status", "=", "Open"],
  ])
  const { data: inProgressCount } = useFrappeGetDocCount("VMS Project", [
    ["status", "=", "In Progress"],
  ])
  const { data: completedCount } = useFrappeGetDocCount("VMS Project", [
    ["status", "=", "Completed"],
  ])

  const { call: getBucketUsage } = useFrappePostCall("vms.api.get_bucket_usage")
  const [bucketUsage, setBucketUsage] = useState<{
    payload_size: number
    object_count: number
  } | null>(null)

  useEffect(() => {
    getBucketUsage({})
      .then((res) => setBucketUsage(res.message as { payload_size: number; object_count: number }))
      .catch(() => {})
  }, [getBucketUsage])

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Overview of your projects and recent activity.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Card
          size="sm"
          className="cursor-pointer"
          onClick={() => navigate("/inbox")}
        >
          <CardHeader>
            <CardDescription>Inbox</CardDescription>
            <CardTitle className="text-2xl">
              {inboxCount === undefined ? (
                <Skeleton className="h-7 w-8" />
              ) : (
                <>
                  {inboxCount}
                  {inboxCount > 0 && (
                    <Badge variant="destructive" className="ml-2 text-xs">
                      New
                    </Badge>
                  )}
                </>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Open</CardDescription>
            <CardTitle className="text-2xl">
              {openCount === undefined ? <Skeleton className="h-7 w-8" /> : openCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>In Progress</CardDescription>
            <CardTitle className="text-2xl">
              {inProgressCount === undefined ? <Skeleton className="h-7 w-8" /> : inProgressCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-2xl">
              {completedCount === undefined ? <Skeleton className="h-7 w-8" /> : completedCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Storage Used</CardDescription>
            <CardTitle className="text-2xl">
              {bucketUsage
                ? formatBytes(bucketUsage.payload_size)
                : <Skeleton className="h-7 w-16" />}
            </CardTitle>
            {bucketUsage && (
              <p className="text-xs text-muted-foreground">
                {bucketUsage.object_count.toLocaleString()} objects
              </p>
            )}
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Projects</CardTitle>
          </CardHeader>
          <CardContent>
            {!projects ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects yet.
              </p>
            ) : (
              <div className="space-y-3">
                {projects.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/projects/${p.name}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {p.project_name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.name}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">{p.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            {!recentAssets ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No uploads yet.
              </p>
            ) : (
              <div className="space-y-3">
                {recentAssets.map((a) => (
                  <div
                    key={a.name}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {a.file_name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.project || "Inbox"} &middot;{" "}
                        {new Date(a.creation).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">{a.category}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
