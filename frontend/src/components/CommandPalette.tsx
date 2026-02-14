import { useCallback, useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router"
import { useFrappeGetCall } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare02Icon,
  InboxIcon,
  FolderVideoIcon,
  Audit01Icon,
  Settings01Icon,
  UserAdd01Icon,
  CloudUploadIcon,
  UserCircleIcon,
  FileVideoIcon,
} from "@hugeicons/core-free-icons"
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenSettings: () => void
  onOpenUpload: () => void
}

interface SearchResult {
  name: string
  file_name: string
  project?: string
  category?: string
  file_type?: string
}

export function CommandPalette({
  open,
  onOpenChange,
  onOpenSettings,
  onOpenUpload,
}: CommandPaletteProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState("")

  // Detect current project context from URL
  const projectMatch = location.pathname.match(/\/projects\/([^/]+)/)
  const currentProjectId = projectMatch ? projectMatch[1] : null

  // Search assets when query has 2+ chars
  const shouldSearch = query.trim().length >= 2
  const { data: searchData } = useFrappeGetCall<{
    message: { results: SearchResult[] }
  }>(
    shouldSearch ? "vms.api.search_assets" : null,
    shouldSearch
      ? {
          query: query.trim(),
          project: currentProjectId || undefined,
          limit: 8,
        }
      : undefined,
    undefined,
    {
      revalidateOnFocus: false,
    }
  )

  const searchResults = searchData?.message?.results || []

  const runCommand = useCallback(
    (command: () => void) => {
      onOpenChange(false)
      command()
    },
    [onOpenChange]
  )

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("")
    }
  }, [open])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command shouldFilter={!shouldSearch}>
        <CommandInput
          placeholder={
            currentProjectId
              ? "Search in project or type a command..."
              : "Type a command or search..."
          }
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Search Results */}
          {shouldSearch && searchResults.length > 0 && (
            <>
              <CommandGroup
                heading={currentProjectId ? "Files in project" : "Files"}
              >
                {searchResults.map((result) => (
                  <CommandItem
                    key={result.name}
                    value={`file-${result.name}`}
                    onSelect={() =>
                      runCommand(() =>
                        navigate(`/review/${result.name}`)
                      )
                    }
                  >
                    <HugeiconsIcon
                      icon={FileVideoIcon}
                      strokeWidth={2}
                      className="size-4"
                    />
                    <span className="flex-1 truncate">{result.file_name}</span>
                    {result.category && (
                      <span className="text-xs text-muted-foreground">
                        {result.category}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {/* Navigation Commands */}
          <CommandGroup heading="Navigation">
            <CommandItem
              onSelect={() => runCommand(() => navigate("/"))}
            >
              <HugeiconsIcon
                icon={DashboardSquare02Icon}
                strokeWidth={2}
                className="size-4"
              />
              <span>Go to Dashboard</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => navigate("/inbox"))}
            >
              <HugeiconsIcon
                icon={InboxIcon}
                strokeWidth={2}
                className="size-4"
              />
              <span>Go to Inbox</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => navigate("/projects"))}
            >
              <HugeiconsIcon
                icon={FolderVideoIcon}
                strokeWidth={2}
                className="size-4"
              />
              <span>Go to Projects</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => navigate("/audit-logs"))}
            >
              <HugeiconsIcon
                icon={Audit01Icon}
                strokeWidth={2}
                className="size-4"
              />
              <span>Go to Audit Logs</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Actions */}
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() =>
                runCommand(() => onOpenUpload())
              }
            >
              <HugeiconsIcon
                icon={CloudUploadIcon}
                strokeWidth={2}
                className="size-4"
              />
              <span>Upload Files</span>
              <CommandShortcut>U</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() => onOpenSettings())
              }
            >
              <HugeiconsIcon
                icon={Settings01Icon}
                strokeWidth={2}
                className="size-4"
              />
              <span>Open Settings</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() => {
                  onOpenSettings()
                  // Settings dialog opens on Profile tab by default — users tab has invite
                })
              }
            >
              <HugeiconsIcon
                icon={UserAdd01Icon}
                strokeWidth={2}
                className="size-4"
              />
              <span>Invite User</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() => onOpenSettings())
              }
            >
              <HugeiconsIcon
                icon={UserCircleIcon}
                strokeWidth={2}
                className="size-4"
              />
              <span>Profile</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

/**
 * Hook to register Cmd+K keyboard shortcut
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  return { open, setOpen }
}
