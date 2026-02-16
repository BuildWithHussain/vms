import { useFrappeGetDoc, useFrappeUpdateDoc, useFrappePostCall } from "frappe-react-sdk"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface VMSSettings {
  name: string
  r2_account_id: string
  r2_access_key_id: string
  r2_secret_access_key: string
  r2_bucket_name: string
  r2_public_url: string
  cloudflare_api_token: string
  max_file_size: number
  presigned_url_expiry: number
  allowed_extensions: string
  transcription_provider: string
  whisper_model: string
}


export function GeneralSection() {
  const { data, error, isValidating, mutate } = useFrappeGetDoc<VMSSettings>(
    "VMS Settings",
    "VMS Settings"
  )
  const { updateDoc, loading: saving } = useFrappeUpdateDoc<VMSSettings>()
  const { call: testConnection, loading: testing } = useFrappePostCall("vms.api.test_r2_connection")

  const [form, setForm] = useState<Partial<VMSSettings>>({})
  const initialForm = useRef<Partial<VMSSettings>>({})

  useEffect(() => {
    if (data) {
      const values = {
        r2_account_id: data.r2_account_id || "",
        r2_access_key_id: data.r2_access_key_id || "",
        r2_secret_access_key: data.r2_secret_access_key || "",
        r2_bucket_name: data.r2_bucket_name || "",
        r2_public_url: data.r2_public_url || "",
        cloudflare_api_token: data.cloudflare_api_token || "",
        max_file_size: Math.round((data.max_file_size || 5368709120) / (1024 * 1024)),
        presigned_url_expiry: data.presigned_url_expiry || 3600,
        allowed_extensions: data.allowed_extensions || "mp4,mov,avi,mkv,webm,m4v",
        transcription_provider: data.transcription_provider || "whisper.cpp",
        whisper_model: data.whisper_model || "ggml-small.en",
      }
      setForm(values)
      initialForm.current = values
    }
  }, [data])

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm.current)

  const handleTestConnection = async () => {
    try {
      await testConnection({})
      toast.success("R2 connection successful")
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "R2 connection failed"
      toast.error(message)
    }
  }

  const handleChange = (field: keyof VMSSettings, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    try {
      await updateDoc("VMS Settings", "VMS Settings", {
        ...form,
        max_file_size: (form.max_file_size || 0) * 1024 * 1024,
      })
      await mutate()
      toast.success("Settings saved")
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
          <Skeleton className="h-9 w-full rounded-md" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-52" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 space-y-6">
          {/* Cloudflare R2 */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Cloudflare R2</h3>
              <p className="text-xs text-muted-foreground">
                Credentials for your Cloudflare R2 bucket.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="r2_account_id" className="text-xs">Account ID</Label>
                <Input
                  id="r2_account_id"
                  value={form.r2_account_id ?? ""}
                  onChange={(e) => handleChange("r2_account_id", e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="r2_access_key_id" className="text-xs">Access Key ID</Label>
                  <Input
                    id="r2_access_key_id"
                    value={form.r2_access_key_id ?? ""}
                    onChange={(e) =>
                      handleChange("r2_access_key_id", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="r2_secret_access_key" className="text-xs">Secret Access Key</Label>
                  <Input
                    id="r2_secret_access_key"
                    type="password"
                    value={form.r2_secret_access_key ?? ""}
                    onChange={(e) =>
                      handleChange("r2_secret_access_key", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="r2_bucket_name" className="text-xs">Bucket Name</Label>
                  <Input
                    id="r2_bucket_name"
                    value={form.r2_bucket_name ?? ""}
                    onChange={(e) =>
                      handleChange("r2_bucket_name", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="r2_public_url" className="text-xs">Public URL</Label>
                  <Input
                    id="r2_public_url"
                    placeholder="https://cdn.example.com"
                    value={form.r2_public_url ?? ""}
                    onChange={(e) =>
                      handleChange("r2_public_url", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cloudflare_api_token" className="text-xs">Cloudflare API Token</Label>
                  <Input
                    id="cloudflare_api_token"
                    type="password"
                    placeholder="Bearer token for analytics endpoints"
                    value={form.cloudflare_api_token ?? ""}
                    onChange={(e) =>
                      handleChange("cloudflare_api_token", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    For bucket usage stats. Create at Cloudflare Dashboard &gt; My Profile &gt; API Tokens.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Upload Settings */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Upload Settings</h3>
              <p className="text-xs text-muted-foreground">
                Control file size limits and allowed formats.
              </p>
            </div>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="max_file_size" className="text-xs">Max File Size (MB)</Label>
                  <Input
                    id="max_file_size"
                    type="number"
                    value={form.max_file_size ?? ""}
                    onChange={(e) =>
                      handleChange("max_file_size", parseInt(e.target.value) || 0)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: 5120 MB (5 GB)
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="presigned_url_expiry" className="text-xs">
                    Presigned URL Expiry (seconds)
                  </Label>
                  <Input
                    id="presigned_url_expiry"
                    type="number"
                    value={form.presigned_url_expiry ?? ""}
                    onChange={(e) =>
                      handleChange(
                        "presigned_url_expiry",
                        parseInt(e.target.value) || 0
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: 1 hour (3600 seconds)
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="allowed_extensions" className="text-xs">Allowed Extensions</Label>
                <Textarea
                  id="allowed_extensions"
                  value={form.allowed_extensions ?? ""}
                  onChange={(e) =>
                    handleChange("allowed_extensions", e.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of allowed file extensions (e.g.
                  mp4,mov,avi,mkv,webm)
                </p>
              </div>
            </div>
          </div>

          {/* Transcription */}
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
                    value={form.transcription_provider ?? "whisper.cpp"}
                    onValueChange={(value) =>
                      handleChange("transcription_provider", value)
                    }
                  >
                    <SelectTrigger id="transcription_provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whisper.cpp">whisper.cpp (local)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
            {testing ? "Testing..." : "Test Connection"}
          </Button>
          <Button onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </>
  )
}
