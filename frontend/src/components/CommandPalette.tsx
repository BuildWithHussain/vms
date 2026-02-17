import { useCallback, useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router"
import { useFrappeGetCall } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare02Icon,
  Album01Icon,
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
  onOpenSettings: (tab?: string) => void
  onOpenUpload: () => void
}

interface SearchResult {
  name: string
  file_name: string
  project?: string
  project_name?: string
  category?: string
  file_type?: string
}

interface ProjectResult {
  name: string
  project_name: string
  status?: string
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

  // Search projects when query has 2+ chars and not already in a project context
  const shouldSearchProjects = shouldSearch && !currentProjectId
  const { data: projectSearchData } = useFrappeGetCall<{
    message: { results: ProjectResult[] }
  }>(
    shouldSearchProjects ? "vms.api.search_projects" : null,
    shouldSearchProjects
      ? { query: query.trim(), limit: 5 }
      : undefined,
    undefined,
    { revalidateOnFocus: false }
  )

  const projectResults = projectSearchData?.message?.results || []

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
      <Command>
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
          {/* Hide empty state when forceMount results exist */}
          {!(shouldSearch && (searchResults.length > 0 || projectResults.length > 0)) && (
            <CommandEmpty>No results found.</CommandEmpty>
          )}

          {/* Search Results */}
          {shouldSearch && searchResults.length > 0 && (
            <>
              <CommandGroup
                heading={currentProjectId ? "Files in project" : "Files"}
                forceMount
              >
                {searchResults.map((result) => (
                  <CommandItem
                    key={result.name}
                    value={`file-${result.name}`}
                    forceMount
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
                    {!currentProjectId && result.project_name && (
                      <span className="text-xs text-muted-foreground">
                        in {result.project_name}
                      </span>
                    )}
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

          {/* Project Search Results */}
          {shouldSearchProjects && projectResults.length > 0 && (
            <>
              <CommandGroup heading="Projects" forceMount>
                {projectResults.map((project) => (
                  <CommandItem
                    key={project.name}
                    value={`project-${project.name}`}
                    forceMount
                    onSelect={() =>
                      runCommand(() =>
                        navigate(`/projects/${project.name}`)
                      )
                    }
                  >
                    <HugeiconsIcon
                      icon={FolderVideoIcon}
                      strokeWidth={2}
                      className="size-4"
                    />
                    <span className="flex-1 truncate">
                      {project.project_name}
                    </span>
                    {project.status && (
                      <span className="text-xs text-muted-foreground">
                        {project.status}
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
              value="dashboard"
              keywords={["home", "overview"]}
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
              value="media pool"
              keywords={["uploads", "unassigned", "media"]}
              onSelect={() => runCommand(() => navigate("/media-pool"))}
            >
              <HugeiconsIcon
                icon={Album01Icon}
                strokeWidth={2}
                className="size-4"
              />
              <span>Go to Media Pool</span>
            </CommandItem>
            <CommandItem
              value="projects"
              keywords={["folders", "videos"]}
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
              value="audit logs"
              keywords={["history", "activity"]}
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
              value="upload files"
              keywords={["add", "import"]}
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
              value="settings"
              keywords={["preferences", "config"]}
              onSelect={() =>
                runCommand(() => onOpenSettings("general"))
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
              value="invite user"
              keywords={["add user", "team"]}
              onSelect={() =>
                runCommand(() => onOpenSettings("users"))
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
              value="profile"
              keywords={["account", "user", "me"]}
              onSelect={() =>
                runCommand(() => onOpenSettings("profile"))
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
