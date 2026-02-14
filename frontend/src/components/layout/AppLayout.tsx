import { useState } from "react"
import { Outlet } from "react-router"
import { AppSidebar } from "./Sidebar"
import { Header } from "./Header"
import { SettingsDialog } from "@/components/SettingsDialog"
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette"
import { UploadDialog } from "@/components/UploadDialog"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState("profile")
  const [uploadOpen, setUploadOpen] = useState(false)
  const commandPalette = useCommandPalette()

  const openSettings = (tab = "profile") => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  return (
    <SidebarProvider>
      <AppSidebar onOpenSettings={() => openSettings()} />
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
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
      />
      <CommandPalette
        open={commandPalette.open}
        onOpenChange={commandPalette.setOpen}
        onOpenSettings={openSettings}
        onOpenUpload={() => setUploadOpen(true)}
      />
    </SidebarProvider>
  )
}
