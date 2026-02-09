import { useFrappeGetDoc, useFrappeUpdateDoc, useFrappePostCall } from "frappe-react-sdk"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Settings01Icon } from "@hugeicons/core-free-icons"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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
}

const sections = [
  { id: "general", label: "General", icon: Settings01Icon },
] as const

type SectionId = (typeof sections)[number]["id"]

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [activeSection, setActiveSection] = useState<SectionId>("general")

  const { data, error, isValidating, mutate } = useFrappeGetDoc<VMSSettings>(
    "VMS Settings",
    "VMS Settings"
  )
  const { updateDoc, loading: saving } = useFrappeUpdateDoc<VMSSettings>()
  const { call: testConnection, loading: testing } = useFrappePostCall("vms.api.test_r2_connection")

  const [form, setForm] = useState<Partial<VMSSettings>>({})

  useEffect(() => {
    if (data) {
      setForm({
        r2_account_id: data.r2_account_id || "",
        r2_access_key_id: data.r2_access_key_id || "",
        r2_secret_access_key: data.r2_secret_access_key || "",
        r2_bucket_name: data.r2_bucket_name || "",
        r2_public_url: data.r2_public_url || "",
        cloudflare_api_token: data.cloudflare_api_token || "",
        max_file_size: data.max_file_size || 5368709120,
        presigned_url_expiry: data.presigned_url_expiry || 3600,
        allowed_extensions: data.allowed_extensions || "mp4,mov,avi,mkv,webm,m4v",
      })
    }
  }, [data])

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
      await updateDoc("VMS Settings", "VMS Settings", form)
      await mutate()
      toast.success("Settings saved")
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save settings"
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <div className="flex h-[min(85vh,750px)]">
          {/* Sidebar */}
          <div className="w-48 shrink-0 border-r border-border bg-muted/30">
            <div className="p-4 pb-2">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">Settings</DialogTitle>
                <DialogDescription className="sr-only">
                  Application settings
                </DialogDescription>
              </DialogHeader>
            </div>
            <nav className="space-y-0.5 p-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    activeSection === section.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  )}
                >
                  <HugeiconsIcon icon={section.icon} strokeWidth={2} className="size-4" />
                  {section.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              {error ? (
                <div className="p-6 text-destructive">
                  Failed to load settings. Make sure VMS Settings DocType exists and you
                  have permission.
                </div>
              ) : isValidating && !data ? (
                <div className="p-6 text-muted-foreground">Loading settings...</div>
              ) : activeSection === "general" ? (
                <div className="p-6 space-y-6">
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
                    <div className="grid grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="max_file_size" className="text-xs">Max File Size (bytes)</Label>
                        <Input
                          id="max_file_size"
                          type="number"
                          value={form.max_file_size ?? ""}
                          onChange={(e) =>
                            handleChange("max_file_size", parseInt(e.target.value) || 0)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Default: 5 GB (5368709120 bytes)
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

              </div>
            ) : null}
            </div>

            {/* Sticky footer */}
            <div className="flex justify-end gap-3 border-t border-border px-6 py-3">
              <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                {testing ? "Testing..." : "Test Connection"}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
