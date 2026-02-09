import { useState } from "react"
import { useFrappeAuth } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon, LogoutIcon, UserCircleIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { UploadDialog } from "@/components/UploadDialog"
import { ModeToggle } from "@/components/mode-toggle"
import { useUser } from "@/context/UserContext"

export function Header() {
  const { logout } = useFrappeAuth()
  const { user } = useUser()
  const [uploadOpen, setUploadOpen] = useState(false)

  const handleLogout = () => {
    logout()
    window.location.href = "/login"
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 md:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 hidden md:block data-[orientation=vertical]:h-4"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
          <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.5} data-icon="inline-start" />
          <span className="hidden sm:inline">Upload</span>
        </Button>
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
          <HugeiconsIcon icon={UserCircleIcon} strokeWidth={2} className="size-5" />
          <span>{user?.full_name || user?.email}</span>
        </div>
        <ModeToggle />
        <Button variant="ghost" size="icon-sm" onClick={handleLogout}>
          <HugeiconsIcon icon={LogoutIcon} strokeWidth={2} />
        </Button>
      </div>
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </header>
  )
}
