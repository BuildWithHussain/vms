import { useRegisterSW } from "virtual:pwa-register/react"
import { useEffect } from "react"
import { toast } from "sonner"

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (needRefresh) {
      toast("New version available", {
        description: "Click to update the app.",
        duration: Infinity,
        action: {
          label: "Update",
          onClick: () => {
            updateServiceWorker(true)
            setNeedRefresh(false)
          },
        },
      })
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
