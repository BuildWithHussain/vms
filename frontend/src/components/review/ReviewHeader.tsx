import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Download04Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useDownload } from "@/hooks/useDownload"

interface ReviewHeaderProps {
  assetName: string
  fileName: string
  category?: string
  project?: { name: string; project_name: string } | null
}

export function ReviewHeader({
  assetName,
  fileName,
  category,
  project,
}: ReviewHeaderProps) {
  const navigate = useNavigate()
  const { downloadOne, isDownloading } = useDownload()

  const handleBack = () => {
    if (project) {
      navigate(`/projects/${project.name}`)
    } else {
      navigate("/inbox")
    }
  }

  return (
    <div className="flex items-center gap-2 border-b px-3 py-2 md:gap-3 md:px-4 md:py-2.5">
      <Button variant="ghost" size="icon-sm" onClick={handleBack}>
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} size={18} />
      </Button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 md:gap-2">
          {project && (
            <>
              <span
                className="hidden cursor-pointer text-xs text-muted-foreground hover:text-foreground truncate md:inline"
                onClick={() => navigate(`/projects/${project.name}`)}
              >
                {project.project_name}
              </span>
              <span className="hidden text-xs text-muted-foreground md:inline">/</span>
            </>
          )}
          <span className="text-xs font-medium truncate md:text-sm">{fileName}</span>
          {category && <Badge variant="outline" className="hidden shrink-0 text-[10px] md:inline-flex">{category}</Badge>}
        </div>
      </div>

      <Button
        variant="outline"
        size="icon-sm"
        className="md:hidden"
        onClick={() => downloadOne(assetName, fileName)}
        disabled={isDownloading}
      >
        <HugeiconsIcon icon={Download04Icon} strokeWidth={2} size={16} />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="hidden md:inline-flex"
        onClick={() => downloadOne(assetName, fileName)}
        disabled={isDownloading}
      >
        <HugeiconsIcon icon={Download04Icon} strokeWidth={2} data-icon="inline-start" size={16} />
        Download
      </Button>
    </div>
  )
}
