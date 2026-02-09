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
import type { VMSProject, VMSAsset } from "@/types"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Overview of your projects and recent activity.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card
          size="sm"
          className="cursor-pointer"
          onClick={() => navigate("/inbox")}
        >
          <CardHeader>
            <CardDescription>Inbox</CardDescription>
            <CardTitle className="text-2xl">
              {inboxCount ?? 0}
              {(inboxCount ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  New
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Open</CardDescription>
            <CardTitle className="text-2xl">{openCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>In Progress</CardDescription>
            <CardTitle className="text-2xl">
              {inProgressCount ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-2xl">{completedCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Storage Used</CardDescription>
            <CardTitle className="text-2xl">
              {bucketUsage
                ? formatBytes(bucketUsage.payload_size)
                : "–"}
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
            {!projects || projects.length === 0 ? (
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
                    <div>
                      <div className="text-sm font-medium">
                        {p.project_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.name}
                      </div>
                    </div>
                    <Badge variant="outline">{p.status}</Badge>
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
            {!recentAssets || recentAssets.length === 0 ? (
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
                    <div>
                      <div className="text-sm font-medium">
                        {a.file_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.project || "Inbox"} &middot;{" "}
                        {new Date(a.creation).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge variant="secondary">{a.category}</Badge>
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
