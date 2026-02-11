import { useState } from "react"
import { useFrappeGetCall } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { UserAvatar } from "@/components/UserAvatar"
import { Skeleton } from "@/components/ui/skeleton"
import { formatBytes } from "@/lib/utils"
import type { VMSAuditLog } from "@/types"

export function AuditLogPage() {
  const [action, setAction] = useState<string>("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isLoading } = useFrappeGetCall<{
    message: {
      logs: VMSAuditLog[]
      total: number
      page: number
      page_size: number
      total_pages: number
    }
  }>("vms.api.get_audit_logs", {
    action: action && action !== "all" ? action : undefined,
    search: search || undefined,
    page,
    page_size: pageSize,
  })

  const logs = data?.message?.logs ?? []
  const total = data?.message?.total ?? 0
  const totalPages = data?.message?.total_pages ?? 1

  function formatTimestamp(ts: string) {
    const d = new Date(ts)
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">
          Track asset downloads, deletions, and renames
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search file name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-64 pl-9"
          />
        </div>
        <Select
          value={action}
          onValueChange={(v) => {
            setAction(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="Download">Download</SelectItem>
            <SelectItem value="Delete">Delete</SelectItem>
            <SelectItem value="Rename">Rename</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {total} {total === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>File Name</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead className="text-right">Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-6 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No audit logs found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.name}>
                  <TableCell>
                    <Badge
                      variant={log.action === "Delete" ? "destructive" : log.action === "Rename" ? "outline" : "secondary"}
                    >
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate font-medium">
                    {log.file_name || log.asset_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.project || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        name={log.user_full_name}
                        image={log.user_image}
                      />
                      <span className="text-sm">{log.user_full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTimestamp(log.timestamp)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {log.file_size ? formatBytes(log.file_size) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
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
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
