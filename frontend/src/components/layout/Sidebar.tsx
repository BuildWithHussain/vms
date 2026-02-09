import { useState } from "react"
import { NavLink } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare02Icon,
  InboxIcon,
  FolderVideoIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import { SettingsDialog } from "@/components/SettingsDialog"

const navItems = [
  { to: "/", label: "Dashboard", icon: DashboardSquare02Icon },
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/projects", label: "Projects", icon: FolderVideoIcon },
]

export function Sidebar() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <aside className="flex h-full w-56 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <span className="text-lg font-bold text-sidebar-foreground">VMS</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )
            }
          >
            <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-5" />
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setSettingsOpen(true)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}
        >
          <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} className="size-5" />
          Settings
        </button>
      </nav>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  )
}
