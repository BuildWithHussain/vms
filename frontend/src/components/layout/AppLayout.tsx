import { useState } from "react"
import { Outlet } from "react-router"
import { AppSidebar } from "./Sidebar"
import { Header } from "./Header"
import { SettingsDialog } from "@/components/SettingsDialog"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <SidebarProvider>
      <AppSidebar onOpenSettings={() => setSettingsOpen(true)} />
      <SidebarInset>
        <Header />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </SidebarProvider>
  )
}
