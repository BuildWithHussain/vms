import { useState } from "react"
import { useNavigate } from "react-router"
import { useFrappeGetDocList, useFrappeCreateDoc, useFrappeAuth } from "frappe-react-sdk"
import { toast } from "sonner"
import { format } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon, Calendar03Icon } from "@hugeicons/core-free-icons"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import type { VMSProject } from "@/types"

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  Open: "outline",
  "In Progress": "default",
  "In Review": "secondary",
  Completed: "secondary",
  Archived: "outline",
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [description, setDescription] = useState("")
  const [dueDate, setDueDate] = useState<Date | undefined>()

  const { data: projects, mutate } = useFrappeGetDocList<VMSProject>(
    "VMS Project",
    {
      fields: [
        "name",
        "project_name",
        "status",
        "owner_user",
        "due_date",
        "creation",
        "modified",
      ],
      orderBy: { field: "creation", order: "desc" },
      limit: 100,
    }
  )

  const { currentUser } = useFrappeAuth()
  const { createDoc, loading: creating } = useFrappeCreateDoc()

  const handleCreate = async () => {
    if (!projectName.trim()) {
      toast.error("Project name is required")
      return
    }

    try {
      const doc = await createDoc("VMS Project", {
        project_name: projectName.trim(),
        description: description.trim() || undefined,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : undefined,
        owner_user: currentUser ?? "Administrator",
      } as Record<string, unknown>)
      await mutate()
      setDialogOpen(false)
      setProjectName("")
      setDescription("")
      setDueDate(undefined)
      toast.success("Project created")
      navigate(`/projects/${doc.name}`)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create project"
      toast.error(message)
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Manage your video projects.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                New Project
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                Add a new video project to organize your assets.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  placeholder="My Video Project"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate()
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-desc">Description</Label>
                <Textarea
                  id="project-desc"
                  placeholder="Optional description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dueDate && "text-muted-foreground"
                        )}
                      >
                        <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} data-icon="inline-start" />
                        {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                      </Button>
                    }
                  />
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!projects ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="mt-1 h-4 w-24" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">
              No projects yet. Create your first project to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.name}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/projects/${project.name}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="line-clamp-1">
                    {project.project_name}
                  </CardTitle>
                  <Badge variant={statusVariant[project.status] ?? "outline"}>
                    {project.status}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-1">
                  {project.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Created{" "}
                    {new Date(project.creation).toLocaleDateString()}
                  </span>
                  {project.due_date && (
                    <span>
                      Due {new Date(project.due_date).toLocaleDateString()}
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
