import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon, SearchIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useUploadContext } from "@/contexts/UploadContext"

interface HeaderProps {
  onOpenCommandPalette: () => void
}

export function Header({ onOpenCommandPalette }: HeaderProps) {
  const { openUpload } = useUploadContext()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 md:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenCommandPalette}
          className="hidden text-muted-foreground sm:flex"
        >
          <HugeiconsIcon icon={SearchIcon} strokeWidth={2} data-icon="inline-start" />
          <span>Search...</span>
          <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">&#x2318;</span>K
          </kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenCommandPalette}
          className="sm:hidden"
        >
          <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
        </Button>
        <Button variant="outline" size="sm" onClick={() => openUpload()}>
          <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.5} data-icon="inline-start" />
          <span className="hidden sm:inline">Upload</span>
        </Button>
      </div>
    </header>
  )
}
