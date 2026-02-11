import { NavLink, useLocation } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare02Icon,
  InboxIcon,
  FolderVideoIcon,
  Audit01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

const navItems = [
  { to: "/", label: "Dashboard", icon: DashboardSquare02Icon },
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/projects", label: "Projects", icon: FolderVideoIcon },
  { to: "/audit-logs", label: "Audit Logs", icon: Audit01Icon },
]

export function AppSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { setOpenMobile } = useSidebar()
  const location = useLocation()

  return (
    <Sidebar>
      <SidebarHeader className="h-14 shrink-0 flex-row items-center border-b border-sidebar-border px-4">
        <span className="text-lg font-bold text-sidebar-foreground">VMS</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.to === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.to)

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={isActive}
                      render={
                        <NavLink
                          to={item.to}
                          end={item.to === "/"}
                          onClick={() => setOpenMobile(false)}
                        />
                      }
                      tooltip={item.label}
                    >
                      <HugeiconsIcon
                        icon={item.icon}
                        strokeWidth={2}
                        className="size-5"
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    onOpenSettings()
                    setOpenMobile(false)
                  }}
                  tooltip="Settings"
                >
                  <HugeiconsIcon
                    icon={Settings01Icon}
                    strokeWidth={2}
                    className="size-5"
                  />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
