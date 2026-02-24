import React, { useState } from "react"
import { NavLink, useLocation } from "react-router"
import { useFrappeAuth } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare02Icon,
  Album01Icon,
  FolderVideoIcon,
  Audit01Icon,
  Settings01Icon,
  Notification01Icon,
  LogoutIcon,
  Sun02Icon,
  Moon02Icon,
  ArrowUp01Icon,
  Bug01Icon,
  Delete02Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { NotificationSheet, useNotifications } from "@/components/NotificationSheet"
import { useUser } from "@/context/UserContext"
import { useTheme } from "@/components/theme-provider"

const navItems = [
  { to: "/", label: "Dashboard", icon: DashboardSquare02Icon },
  { to: "/uncategorised", label: "Uncategorised", icon: Album01Icon },
  { to: "/projects", label: "Projects", icon: FolderVideoIcon },
  { to: "/audit-logs", label: "Audit Logs", icon: Audit01Icon },
  { to: "/tools", label: "Tools", icon: Wrench01Icon },
]

export function AppSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { setOpenMobile } = useSidebar()
  const { logout } = useFrappeAuth()
  const { user } = useUser()
  const { setTheme, theme } = useTheme()
  const location = useLocation()
  const { unreadCount } = useNotifications()
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const handleLogout = () => {
    logout()
    window.location.href = "/login"
  }

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)

  return (
    <Sidebar>
      <SidebarHeader className="h-14 shrink-0 flex-row items-center gap-2 border-b border-sidebar-border px-4">
        <img src="/assets/vms/frontend/vms-logo.png" alt="VMS" className="size-7 rounded" />
        <span className="text-lg font-bold text-sidebar-foreground">VMS</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item, index) => {
                const isActive =
                  item.to === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.to)

                return (
                  <React.Fragment key={item.to}>
                    <SidebarMenuItem>
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
                    {index === 0 && (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          onClick={() => {
                            setNotificationsOpen(true)
                            setOpenMobile(false)
                          }}
                          tooltip="Notifications"
                        >
                          <HugeiconsIcon
                            icon={Notification01Icon}
                            strokeWidth={2}
                            className="size-5"
                          />
                          <span>Notifications</span>
                          {unreadCount > 0 && (
                            <span className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground group-data-[collapsible=icon]:hidden">
                              {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </React.Fragment>
                )
              })}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === "/trash"}
                  render={
                    <NavLink
                      to="/trash"
                      onClick={() => setOpenMobile(false)}
                    />
                  }
                  tooltip="Trash"
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    strokeWidth={2}
                    className="size-5"
                  />
                  <span>Trash</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuButton size="lg" />}
              >
                <Avatar size="sm">
                  {user?.user_image && <AvatarImage src={user.user_image} />}
                  <AvatarFallback>
                    {user?.full_name ? getInitials(user.full_name) : "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm">{user?.full_name}</span>
                <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-[--anchor-width]"
              >
                <DropdownMenuItem
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  <HugeiconsIcon
                    icon={theme === "dark" ? Sun02Icon : Moon02Icon}
                    strokeWidth={2}
                  />
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    window.open(
                      "https://github.com/BuildWithHussain/vms/issues/new",
                      "_blank",
                    )
                  }
                >
                  <HugeiconsIcon icon={Bug01Icon} strokeWidth={2} />
                  Raise an Issue
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <HugeiconsIcon icon={LogoutIcon} strokeWidth={2} />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <NotificationSheet open={notificationsOpen} onOpenChange={setNotificationsOpen} />
    </Sidebar>
  )
}
