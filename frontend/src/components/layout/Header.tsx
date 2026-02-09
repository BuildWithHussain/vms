import { useFrappeAuth } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { LogoutIcon, UserCircleIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"

export function Header() {
  const { currentUser, logout } = useFrappeAuth()

  const handleLogout = () => {
    logout()
    window.location.href = "/login"
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HugeiconsIcon icon={UserCircleIcon} strokeWidth={2} className="size-5" />
          <span>{currentUser}</span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={handleLogout}>
          <HugeiconsIcon icon={LogoutIcon} strokeWidth={2} />
        </Button>
      </div>
    </header>
  )
}
