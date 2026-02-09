import { useState } from "react"
import { useFrappeAuth } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon, LogoutIcon, UserCircleIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { UploadDialog } from "@/components/UploadDialog"
import { ModeToggle } from "@/components/mode-toggle"

export function Header() {
  const { currentUser, logout } = useFrappeAuth()
  const [uploadOpen, setUploadOpen] = useState(false)

  const handleLogout = () => {
    logout()
    window.location.href = "/login"
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div />
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
          <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.5} data-icon="inline-start" />
          Upload
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HugeiconsIcon icon={UserCircleIcon} strokeWidth={2} className="size-5" />
          <span>{currentUser}</span>
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
