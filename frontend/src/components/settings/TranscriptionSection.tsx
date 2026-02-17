import { useFrappeGetDoc, useFrappeUpdateDoc } from "frappe-react-sdk"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface TranscriptionSettings {
  name: string
  transcription_provider: string
  whisper_model: string
  openai_api_key: string
}

export function TranscriptionSection() {
  const { data, error, isValidating, mutate } = useFrappeGetDoc<TranscriptionSettings>(
    "VMS Settings",
    "VMS Settings"
  )
  const { updateDoc, loading: saving } = useFrappeUpdateDoc<TranscriptionSettings>()

  const [form, setForm] = useState<Partial<TranscriptionSettings>>({})
  const initialForm = useRef<Partial<TranscriptionSettings>>({})

  useEffect(() => {
    if (data) {
      const values = {
        transcription_provider: data.transcription_provider || "OpenAI Whisper",
        whisper_model: data.whisper_model || "ggml-small.en",
        openai_api_key: data.openai_api_key || "",
      }
      setForm(values)
      initialForm.current = values
    }
  }, [data])

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm.current)

  const handleChange = (field: keyof TranscriptionSettings, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    try {
      await updateDoc("VMS Settings", "VMS Settings", { ...form })
      await mutate()
      toast.success("Transcription settings saved")
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save settings"
      toast.error(message)
    }
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You don't have permission to view these settings.
      </div>
    )
  }

  if (isValidating && !data) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Transcription</h3>
              <p className="text-xs text-muted-foreground">
                Configure AI transcription for video assets.
              </p>
            </div>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="transcription_provider" className="text-xs">Provider</Label>
                  <Select
                    value={form.transcription_provider ?? "OpenAI Whisper"}
                    onValueChange={(value) =>
                      handleChange("transcription_provider", value)
                    }
                  >
                    <SelectTrigger id="transcription_provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OpenAI Whisper">OpenAI Whisper (recommended)</SelectItem>
                      <SelectItem value="whisper.cpp">whisper.cpp (local)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.transcription_provider === "OpenAI Whisper" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="openai_api_key" className="text-xs">OpenAI API Key</Label>
                    <Input
                      id="openai_api_key"
                      type="password"
                      placeholder="sk-..."
                      value={form.openai_api_key ?? ""}
                      onChange={(e) => handleChange("openai_api_key", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Get an API key at{" "}
                      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">
                        platform.openai.com
                      </a>
                    </p>
                  </div>
                )}
                {form.transcription_provider === "whisper.cpp" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="whisper_model" className="text-xs">Whisper Model</Label>
                    <Select
                      value={form.whisper_model ?? "ggml-small.en"}
                      onValueChange={(value) =>
                        handleChange("whisper_model", value)
                      }
                    >
                      <SelectTrigger id="whisper_model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ggml-small.en">small.en (recommended)</SelectItem>
                        <SelectItem value="ggml-base.en">base.en (faster, less accurate)</SelectItem>
                        <SelectItem value="ggml-medium.en">medium.en (slower, more accurate)</SelectItem>
                        <SelectItem value="ggml-large">large (slowest, most accurate)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Larger models are more accurate but slower.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3 md:px-6">
        <p className={cn(
          "text-xs text-muted-foreground transition-opacity",
          isDirty ? "opacity-100" : "opacity-0"
        )}>
          Unsaved changes
        </p>
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </>
  )
}
