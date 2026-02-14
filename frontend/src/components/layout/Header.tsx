import { useState } from "react"
import { useFrappeAuth } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon, LogoutIcon, UserCircleIcon, Notification01Icon, SearchIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { UploadDialog } from "@/components/UploadDialog"
import { NotificationSheet, useNotifications } from "@/components/NotificationSheet"
import { ModeToggle } from "@/components/mode-toggle"
import { useUser } from "@/context/UserContext"

interface HeaderProps {
  onOpenCommandPalette: () => void
  uploadOpen: boolean
  onUploadOpenChange: (open: boolean) => void
}

export function Header({ onOpenCommandPalette, uploadOpen, onUploadOpenChange }: HeaderProps) {
  const { logout } = useFrappeAuth()
  const { user } = useUser()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { unreadCount } = useNotifications()

  const handleLogout = () => {
    logout()
    window.location.href = "/login"
  }

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
        <Button variant="outline" size="sm" onClick={() => onUploadOpenChange(true)}>
          <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.5} data-icon="inline-start" />
          <span className="hidden sm:inline">Upload</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setNotificationsOpen(true)}
          className="relative"
        >
          <HugeiconsIcon icon={Notification01Icon} strokeWidth={2} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
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
      <UploadDialog open={uploadOpen} onOpenChange={onUploadOpenChange} />
      <NotificationSheet open={notificationsOpen} onOpenChange={setNotificationsOpen} />
    </header>
  )
}
