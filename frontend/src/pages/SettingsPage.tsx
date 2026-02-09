import { useFrappeGetDoc, useFrappeUpdateDoc, useFrappePostCall } from "frappe-react-sdk"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

interface VMSSettings {
  name: string
  r2_account_id: string
  r2_access_key_id: string
  r2_secret_access_key: string
  r2_bucket_name: string
  r2_public_url: string
  max_file_size: number
  presigned_url_expiry: number
  allowed_extensions: string
}

export function SettingsPage() {
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

  if (error) {
    return (
      <div className="text-destructive">
        Failed to load settings. Make sure VMS Settings DocType exists and you
        have permission.
      </div>
    )
  }

  if (isValidating && !data) {
    return <div className="text-muted-foreground">Loading settings...</div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Configure Cloudflare R2 storage and upload settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cloudflare R2</CardTitle>
          <CardDescription>
            Credentials for your Cloudflare R2 bucket.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="r2_account_id">Account ID</Label>
            <Input
              id="r2_account_id"
              value={form.r2_account_id ?? ""}
              onChange={(e) => handleChange("r2_account_id", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="r2_access_key_id">Access Key ID</Label>
              <Input
                id="r2_access_key_id"
                value={form.r2_access_key_id ?? ""}
                onChange={(e) =>
                  handleChange("r2_access_key_id", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r2_secret_access_key">Secret Access Key</Label>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="r2_bucket_name">Bucket Name</Label>
              <Input
                id="r2_bucket_name"
                value={form.r2_bucket_name ?? ""}
                onChange={(e) =>
                  handleChange("r2_bucket_name", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r2_public_url">Public URL</Label>
              <Input
                id="r2_public_url"
                placeholder="https://cdn.example.com"
                value={form.r2_public_url ?? ""}
                onChange={(e) =>
                  handleChange("r2_public_url", e.target.value)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Settings</CardTitle>
          <CardDescription>
            Control file size limits and allowed formats.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_file_size">Max File Size (bytes)</Label>
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
            <div className="space-y-2">
              <Label htmlFor="presigned_url_expiry">
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
          <div className="space-y-2">
            <Label htmlFor="allowed_extensions">Allowed Extensions</Label>
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
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
          {testing ? "Testing..." : "Test Connection"}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  )
}
