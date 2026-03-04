import { useEffect, useRef, useState, useCallback } from "react"
import { Outlet, useSearchParams } from "react-router"
import { AppSidebar } from "./Sidebar"
import { Header } from "./Header"
import { SettingsDialog } from "@/components/SettingsDialog"
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette"
import { UploadDialog } from "@/components/UploadDialog"
import { useUploadContext } from "@/contexts/UploadContext"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

function AppLayoutInner() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState("profile")
  const [searchParams, setSearchParams] = useSearchParams()
  const commandPalette = useCommandPalette()
  const { openUpload, dialogOpen } = useUploadContext()

  const openSettings = useCallback((tab = "profile") => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }, [])

  // Auto-open settings from URL params (e.g. OAuth redirect)
  useEffect(() => {
    const tab = searchParams.get("settings")
    if (tab) {
      openSettings(tab)
      searchParams.delete("settings")
      setSearchParams(searchParams, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for open-settings events from other components
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      openSettings(detail?.tab || "profile")
    }
    window.addEventListener("open-settings", handler)
    return () => window.removeEventListener("open-settings", handler)
  }, [openSettings])

  // Refs for dialog state — read inside keydown handler without re-subscribing
  const settingsOpenRef = useRef(settingsOpen)
  const uploadOpenRef = useRef(dialogOpen)
  const commandPaletteOpenRef = useRef(commandPalette.open)
  settingsOpenRef.current = settingsOpen
  uploadOpenRef.current = dialogOpen
  commandPaletteOpenRef.current = commandPalette.open

  // Global keyboard shortcuts (single-key, no modifiers)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if any modifier is held or if typing in an input
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
      // Skip if any dialog is open
      if (settingsOpenRef.current || uploadOpenRef.current || commandPaletteOpenRef.current) return

      if (e.key === "u" || e.key === "U") {
        e.preventDefault()
        openUpload()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [openUpload])

  return (
    <SidebarProvider>
      <AppSidebar onOpenSettings={() => openSettings()} />
      <SidebarInset>
        <Header
          onOpenCommandPalette={() => commandPalette.setOpen(true)}
        />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
      <UploadDialog />
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
        onOpenUpload={() => openUpload()}
      />
    </SidebarProvider>
  )
}

export function AppLayout() {
  return <AppLayoutInner />
}
