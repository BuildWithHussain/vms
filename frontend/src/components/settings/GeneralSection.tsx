import { useFrappeGetDoc, useFrappeUpdateDoc, useFrappePostCall } from "frappe-react-sdk"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tag, TagInput } from "emblor"
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
  const { call: resetSetup, loading: resetting } = useFrappePostCall("vms.api.reset_setup")

  const GB_TO_BYTES = 1024 * 1024 * 1024
  const MB_TO_BYTES = 1024 * 1024

  const [form, setForm] = useState<Partial<VMSSettings>>({})
  const initialForm = useRef<Partial<VMSSettings>>({})

  // File size stored in MB for precision; slider works in GB (2-40, step 2)
  const [maxFileSizeMB, setMaxFileSizeMB] = useState(5 * 1024) // 5 GB default in MB
  const [customMBInput, setCustomMBInput] = useState("")
  const [extensionTags, setExtensionTags] = useState<Tag[]>([])
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null)
  const initialMaxFileSizeMB = useRef(5 * 1024)
  const initialExtensionTags = useRef<Tag[]>([])

  useEffect(() => {
    if (data) {
      const values = {
        r2_account_id: data.r2_account_id || "",
        r2_access_key_id: data.r2_access_key_id || "",
        r2_secret_access_key: data.r2_secret_access_key || "",
        r2_bucket_name: data.r2_bucket_name || "",
        r2_public_url: data.r2_public_url || "",
        cloudflare_api_token: data.cloudflare_api_token || "",
        presigned_url_expiry: data.presigned_url_expiry || 3600,
        transcription_provider: data.transcription_provider || "whisper.cpp",
        whisper_model: data.whisper_model || "ggml-small.en",
      }
      setForm(values)
      initialForm.current = values

      // File size: bytes → MB
      const sizeMB = Math.round((data.max_file_size || 5 * GB_TO_BYTES) / MB_TO_BYTES)
      setMaxFileSizeMB(sizeMB)
      setCustomMBInput(String(sizeMB))
      initialMaxFileSizeMB.current = sizeMB

      // Extensions: comma string → tags
      const exts = (data.allowed_extensions || "mp4,mov,avi,mkv,webm,m4v")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
      const tags = exts.map((ext, i) => ({ id: String(i), text: ext }))
      setExtensionTags(tags)
      initialExtensionTags.current = tags
    }
  }, [data])

  const isDirty =
    JSON.stringify(form) !== JSON.stringify(initialForm.current) ||
    maxFileSizeMB !== initialMaxFileSizeMB.current ||
    JSON.stringify(extensionTags.map((t) => t.text)) !==
      JSON.stringify(initialExtensionTags.current.map((t) => t.text))

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
        max_file_size: maxFileSizeMB * MB_TO_BYTES,
        allowed_extensions: extensionTags.map((t) => t.text).join(","),
      })
      await mutate()
      toast.success("Settings saved")
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save settings"
      toast.error(message)
    }
  }

  const handleResetSetup = async () => {
    try {
      await resetSetup({})
      toast.success("Setup reset. Reloading...")
      setTimeout(() => window.location.reload(), 500)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to reset setup"
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Max File Size</Label>
                  <span className="text-sm font-medium">
                    {maxFileSizeMB >= 1024
                      ? `${(maxFileSizeMB / 1024).toFixed(maxFileSizeMB % 1024 === 0 ? 0 : 1)} GB`
                      : `${maxFileSizeMB} MB`}
                  </span>
                </div>
                <Slider
                  value={[Math.max(2, Math.min(Math.round(maxFileSizeMB / 1024 / 2) * 2, 40))]}
                  onValueChange={(values: number[]) => {
                    const mb = values[0] * 1024
                    setMaxFileSizeMB(mb)
                    setCustomMBInput(String(mb))
                  }}
                  min={2}
                  max={40}
                  step={2}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>2 GB</span>
                  <span>20 GB</span>
                  <span>40 GB</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="custom_mb" className="text-xs text-muted-foreground whitespace-nowrap">
                    Custom (MB)
                  </Label>
                  <Input
                    id="custom_mb"
                    type="number"
                    min={1}
                    className="w-28 h-8 text-xs"
                    value={customMBInput}
                    onChange={(e) => setCustomMBInput(e.target.value)}
                    onBlur={() => {
                      const val = parseInt(customMBInput)
                      if (val && val > 0) {
                        setMaxFileSizeMB(val)
                      } else {
                        setCustomMBInput(String(maxFileSizeMB))
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = parseInt(customMBInput)
                        if (val && val > 0) {
                          setMaxFileSizeMB(val)
                        } else {
                          setCustomMBInput(String(maxFileSizeMB))
                        }
                      }
                    }}
                  />
                </div>
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
              <div className="space-y-1.5">
                <Label className="text-xs">Allowed Extensions</Label>
                <TagInput
                  tags={extensionTags}
                  setTags={(newTags) => {
                    if (typeof newTags === "function") {
                      setExtensionTags(newTags)
                    } else {
                      setExtensionTags(newTags)
                    }
                  }}
                  placeholder="Add format (e.g. mp4)"
                  activeTagIndex={activeTagIndex}
                  setActiveTagIndex={setActiveTagIndex}
                  styleClasses={{
                    inlineTagsContainer: "border-input bg-background rounded-md p-1 gap-1",
                    input: "text-sm placeholder:text-muted-foreground",
                    tag: {
                      body: "bg-secondary text-secondary-foreground rounded-md pl-2 text-xs",
                      closeButton: "text-muted-foreground hover:text-foreground",
                    },
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Type an extension and press Enter to add.
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

          {/* Re-run Setup */}
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-4">
            <div>
              <p className="text-xs font-medium">Setup Wizard</p>
              <p className="text-xs text-muted-foreground">
                Re-run the initial setup wizard to reconfigure your workspace.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetSetup}
              disabled={resetting}
            >
              {resetting ? "Resetting..." : "Re-run Setup"}
            </Button>
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
