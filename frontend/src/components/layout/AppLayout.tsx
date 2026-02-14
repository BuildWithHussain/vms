import { useState } from "react"
import { Outlet } from "react-router"
import { AppSidebar } from "./Sidebar"
import { Header } from "./Header"
import { SettingsDialog } from "@/components/SettingsDialog"
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const commandPalette = useCommandPalette()

  return (
    <SidebarProvider>
      <AppSidebar onOpenSettings={() => setSettingsOpen(true)} />
      <SidebarInset>
        <Header
          onOpenCommandPalette={() => commandPalette.setOpen(true)}
          uploadOpen={uploadOpen}
          onUploadOpenChange={setUploadOpen}
        />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <CommandPalette
        open={commandPalette.open}
        onOpenChange={commandPalette.setOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenUpload={() => setUploadOpen(true)}
      />
    </SidebarProvider>
  )
}
