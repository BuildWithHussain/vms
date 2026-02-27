import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { useUpload, type FileUploadItem } from "@/hooks/useUpload"

export interface UploadConfig {
  project?: string
  folder?: string
  category?: string
  existingFileNames?: string[]
  initialFiles?: File[]
  onComplete?: () => void
}

interface UploadContextType {
  // Upload state
  files: FileUploadItem[]
  addFiles: ReturnType<typeof useUpload>["addFiles"]
  cancelFile: (id: string) => void
  retryFile: (id: string) => void
  isUploading: boolean

  // Dialog state
  dialogOpen: boolean
  minimized: boolean

  // Actions
  openUpload: (config?: UploadConfig) => void
  minimize: () => void
  expand: () => void
  closeUpload: () => void
  dismiss: () => void

  // Current config (for the dialog UI)
  config: UploadConfig
}

const UploadContext = createContext<UploadContextType | null>(null)

export function useUploadContext() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error("useUploadContext must be used within UploadProvider")
  return ctx
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [config, setConfig] = useState<UploadConfig>({})
  const onCompleteRef = useRef<(() => void) | undefined>()

  const upload = useUpload({
    onAllComplete: () => {
      onCompleteRef.current?.()
    },
  })

  // Upload report: send telemetry when 2+ files complete
  const { call: sendUploadReport } = useFrappePostCall("vms.api.send_upload_report")
  const reportSentRef = useRef(false)
  const allDone =
    upload.files.length > 0 &&
    upload.files.every(
      (f) => f.status === "done" || f.status === "error" || f.status === "cancelled",
    )

  useEffect(() => {
    if (allDone && upload.files.length >= 2 && !reportSentRef.current) {
      reportSentRef.current = true
      const payload = upload.files.map((f) => ({
        name: f.displayName,
        size: f.file.size,
        status: f.status,
        error: f.error,
      }))
      sendUploadReport({ files: JSON.stringify(payload) }).catch(() => {})
    }
    if (!allDone && upload.files.length === 0) {
      reportSentRef.current = false
    }
  }, [allDone, upload.files, sendUploadReport])

  const openUpload = useCallback((newConfig?: UploadConfig) => {
    if (newConfig) {
      setConfig(newConfig)
      onCompleteRef.current = newConfig.onComplete
    }
    setDialogOpen(true)
    setMinimized(false)
  }, [])

  const minimize = useCallback(() => {
    setDialogOpen(false)
    setMinimized(true)
  }, [])

  const expand = useCallback(() => {
    setDialogOpen(true)
    setMinimized(false)
  }, [])

  const closeUpload = useCallback(() => {
    if (!upload.isUploading) {
      setDialogOpen(false)
      setMinimized(false)
      if (upload.files.some((f) => f.status === "done")) {
        onCompleteRef.current?.()
      }
      upload.reset()
      setConfig({})
      onCompleteRef.current = undefined
      reportSentRef.current = false
    }
  }, [upload])

  const dismiss = useCallback(() => {
    setMinimized(false)
    upload.reset()
    setConfig({})
    onCompleteRef.current = undefined
    reportSentRef.current = false
  }, [upload])

  return (
    <UploadContext.Provider
      value={{
        files: upload.files,
        addFiles: upload.addFiles,
        cancelFile: upload.cancelFile,
        retryFile: upload.retryFile,
        isUploading: upload.isUploading,
        dialogOpen,
        minimized,
        openUpload,
        minimize,
        expand,
        closeUpload,
        dismiss,
        config,
      }}
    >
      {children}
    </UploadContext.Provider>
  )
}
