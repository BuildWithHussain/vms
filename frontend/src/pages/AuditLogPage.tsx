import { useState } from "react"
import { useFrappeGetCall } from "frappe-react-sdk"
import { format } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Search01Icon,
  Audit01Icon,
  ArrowUpDownIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Calendar01Icon,
  Cancel01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { UserAvatar } from "@/components/UserAvatar"
import { Skeleton } from "@/components/ui/skeleton"
import { formatBytes } from "@/lib/utils"
import type { VMSAuditLog } from "@/types"
import type { DateRange } from "react-day-picker"

const columns: ColumnDef<VMSAuditLog>[] = [
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => {
      const action = row.getValue<string>("action")
      return (
        <Badge
          variant={
            action === "Delete"
              ? "destructive"
              : action === "Rename"
                ? "outline"
                : "secondary"
          }
        >
          {action}
        </Badge>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: "file_name",
    header: ({ column }) => (
      <SortableHeader column={column} label="File Name" />
    ),
    cell: ({ row }) => (
      <span className="max-w-[200px] truncate font-medium block">
        {row.original.file_name || row.original.asset_name}
      </span>
    ),
  },
  {
    accessorKey: "project_name",
    header: "Project",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.project_name || "—"}
      </span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "user_full_name",
    header: "User",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <UserAvatar
          name={row.original.user_full_name}
          image={row.original.user_image}
        />
        <span className="text-sm">{row.original.user_full_name}</span>
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "timestamp",
    header: ({ column }) => (
      <SortableHeader column={column} label="Timestamp" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatTimestamp(row.getValue("timestamp"))}
      </span>
    ),
  },
  {
    accessorKey: "file_size",
    header: ({ column }) => (
      <SortableHeader column={column} label="Size" className="justify-end" />
    ),
    cell: ({ row }) => {
      const size = row.getValue<number | undefined>("file_size")
      return (
        <span className="text-right text-muted-foreground block">
          {size ? formatBytes(size) : "—"}
        </span>
      )
    },
  },
]

function SortableHeader({
  column,
  label,
  className = "",
}: {
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" }
  label: string
  className?: string
}) {
  const sorted = column.getIsSorted()
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`-ml-3 h-8 ${className}`}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      <HugeiconsIcon
        icon={
          sorted === "asc"
            ? ArrowUp01Icon
            : sorted === "desc"
              ? ArrowDown01Icon
              : ArrowUpDownIcon
        }
        className="ml-1 size-3.5"
      />
    </Button>
  )
}

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

export function AuditLogPage() {
  const [action, setAction] = useState<string>("")
  const [user, setUser] = useState<string>("")
  const [project, setProject] = useState<string>("")
  const [projectOpen, setProjectOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [page, setPage] = useState(1)
  const [sorting, setSorting] = useState<SortingState>([])
  const pageSize = 20

  const { data: filterData } = useFrappeGetCall<{
    message: {
      users: { value: string; label: string }[]
      projects: { value: string; label: string }[]
    }
  }>("vms.api.get_audit_log_filters")

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
    user: user && user !== "all" ? user : undefined,
    project: project && project !== "all" ? project : undefined,
    search: search || undefined,
    from_date: dateRange?.from
      ? format(dateRange.from, "yyyy-MM-dd")
      : undefined,
    to_date: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
    page,
    page_size: pageSize,
  })

  const logs = data?.message?.logs ?? []
  const total = data?.message?.total ?? 0
  const totalPages = data?.message?.total_pages ?? 1
  const users = filterData?.message?.users ?? []
  const projects = filterData?.message?.projects ?? []

  const hasActiveFilters =
    (action && action !== "all") ||
    (user && user !== "all") ||
    (project && project !== "all") ||
    search ||
    dateRange?.from

  const table = useReactTable({
    data: logs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    manualPagination: true,
    pageCount: totalPages,
  })

  function clearFilters() {
    setAction("")
    setUser("")
    setProject("")
    setSearch("")
    setDateRange(undefined)
    setPage(1)
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
            className="w-56 pl-9"
          />
        </div>
        <Select
          value={action}
          onValueChange={(v) => {
            setAction(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="Download">Download</SelectItem>
            <SelectItem value="Delete">Delete</SelectItem>
            <SelectItem value="Rename">Rename</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={user}
          onValueChange={(v) => {
            setUser(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover open={projectOpen} onOpenChange={setProjectOpen}>
          <PopoverTrigger
            render={<Button variant="outline" role="combobox" aria-expanded={projectOpen} />}
            className="w-44 justify-between font-normal"
          >
            <span className="truncate">
              {project && project !== "all"
                ? projects.find((p) => p.value === project)?.label ?? project
                : "All projects"}
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              className="ml-auto size-4 shrink-0 opacity-50"
            />
          </PopoverTrigger>
          <PopoverContent className="w-44 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search project..." />
              <CommandList>
                <CommandEmpty>No project found.</CommandEmpty>
                <CommandGroup>
                  {projects.map((p) => (
                    <CommandItem
                      key={p.value}
                      value={p.label}
                      onSelect={() => {
                        setProject(project === p.value ? "" : p.value)
                        setProjectOpen(false)
                        setPage(1)
                      }}
                      data-checked={project === p.value}
                    >
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2}
                        className={`size-4 ${project === p.value ? "opacity-100" : "opacity-0"}`}
                      />
                      {p.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <DateRangePicker value={dateRange} onChange={(range) => { setDateRange(range); setPage(1) }} />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <HugeiconsIcon icon={Cancel01Icon} className="mr-1 size-3.5" />
            Clear
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {total} {total === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-6 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-16" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HugeiconsIcon
                          icon={Audit01Icon}
                          strokeWidth={1.5}
                        />
                      </EmptyMedia>
                      <EmptyTitle>No audit logs found</EmptyTitle>
                      <EmptyDescription>
                        {hasActiveFilters
                          ? "Try adjusting your filters."
                          : "Activity will appear here as assets are downloaded, deleted, or renamed."}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
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

function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
}) {
  const [open, setOpen] = useState(false)

  const label = value?.from
    ? value.to
      ? `${format(value.from, "MMM d, yyyy")} – ${format(value.to, "MMM d, yyyy")}`
      : format(value.from, "MMM d, yyyy")
    : "Date range"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <HugeiconsIcon icon={Calendar01Icon} className="size-4" />
        <span>{label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={(range) => {
            onChange(range)
            if (range?.from && range?.to) {
              setOpen(false)
            }
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
