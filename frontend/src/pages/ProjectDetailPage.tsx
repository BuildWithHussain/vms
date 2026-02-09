import { useParams } from "react-router"

export function ProjectDetailPage() {
  const { projectId } = useParams()

  return (
    <div>
      <h1 className="text-2xl font-bold">Project: {projectId}</h1>
      <p className="mt-2 text-muted-foreground">
        Project assets and details will appear here.
      </p>
    </div>
  )
}
