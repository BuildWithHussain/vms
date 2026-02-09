import { useState } from "react"
import { useNavigate } from "react-router"
import { useFrappeGetDocList, useFrappeCreateDoc, useFrappeAuth } from "frappe-react-sdk"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon } from "@hugeicons/core-free-icons"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
  const [dueDate, setDueDate] = useState("")

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
        due_date: dueDate || undefined,
        owner_user: currentUser ?? "Administrator",
      } as Record<string, unknown>)
      await mutate()
      setDialogOpen(false)
      setProjectName("")
      setDescription("")
      setDueDate("")
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
                <Label htmlFor="project-due">Due Date</Label>
                <Input
                  id="project-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
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
        <div className="text-muted-foreground">Loading projects...</div>
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
