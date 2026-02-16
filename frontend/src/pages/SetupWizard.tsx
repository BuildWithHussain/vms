import { useState, useEffect } from "react"
import { useFrappeGetDoc, useFrappeUpdateDoc, useFrappePostCall, useFrappeGetCall } from "frappe-react-sdk"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { SentIcon, Cancel01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
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
  setup_complete: number
}

interface PendingInvitation {
  name: string
  email: string
  roles: string[]
}

const STEPS = [
  { id: "storage", label: "Storage" },
  { id: "team", label: "Team" },
  { id: "uploads", label: "Uploads" },
  { id: "formats", label: "Formats" },
] as const

// File size slider: 2 GB steps, from 2 to 40 GB (displayed in GB, stored in bytes)
const GB_TO_BYTES = 1024 * 1024 * 1024
const MB_TO_BYTES = 1024 * 1024

const DEFAULT_EXTENSIONS = ["mp4", "mov", "avi", "mkv", "webm", "m4v"]

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)

  // R2 form state
  const [r2Form, setR2Form] = useState({
    r2_account_id: "",
    r2_access_key_id: "",
    r2_secret_access_key: "",
    r2_bucket_name: "",
    r2_public_url: "",
    cloudflare_api_token: "",
  })

  // Upload settings (stored in MB for precision)
  const [maxFileSizeMB, setMaxFileSizeMB] = useState(5 * 1024) // 5 GB default in MB
  const [customMBInput, setCustomMBInput] = useState(String(5 * 1024))

  // File formats (emblor tags)
  const [extensionTags, setExtensionTags] = useState<Tag[]>(
    DEFAULT_EXTENSIONS.map((ext, i) => ({ id: String(i), text: ext }))
  )
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null)

  // Invite state
  const [email, setEmail] = useState("")

  // Load existing settings
  const { data: settings, isLoading: settingsLoading } = useFrappeGetDoc<VMSSettings>(
    "VMS Settings",
    "VMS Settings"
  )
  const { updateDoc, loading: saving } = useFrappeUpdateDoc()
  const { call: testConnection, loading: testing } = useFrappePostCall("vms.api.test_r2_connection")
  const { call: completeSetup } = useFrappePostCall("vms.api.complete_setup")

  // Invite APIs
  const { call: inviteByEmail, loading: inviting } = useFrappePostCall(
    "frappe.core.api.user_invitation.invite_by_email"
  )
  const { call: cancelInvitation } = useFrappePostCall(
    "frappe.core.api.user_invitation.cancel_invitation"
  )
  const {
    data: invitesData,
    mutate: mutateInvites,
  } = useFrappeGetCall<PendingInvitation[]>(
    "frappe.core.api.user_invitation.get_pending_invitations",
    { app_name: "vms" }
  )
  const pendingInvites = invitesData?.message || []

  // Seed form from existing settings
  useEffect(() => {
    if (settings) {
      setR2Form({
        r2_account_id: settings.r2_account_id || "",
        r2_access_key_id: settings.r2_access_key_id || "",
        r2_secret_access_key: settings.r2_secret_access_key || "",
        r2_bucket_name: settings.r2_bucket_name || "",
        r2_public_url: settings.r2_public_url || "",
        cloudflare_api_token: settings.cloudflare_api_token || "",
      })
      const sizeMB = Math.round((settings.max_file_size || 5 * GB_TO_BYTES) / MB_TO_BYTES)
      setMaxFileSizeMB(sizeMB)
      setCustomMBInput(String(sizeMB))
      const exts = (settings.allowed_extensions || "mp4,mov,avi,mkv,webm,m4v")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
      setExtensionTags(exts.map((ext, i) => ({ id: String(i), text: ext })))
    }
  }, [settings])

  const handleR2Change = (field: string, value: string) => {
    setR2Form((prev) => ({ ...prev, [field]: value }))
  }

  const handleTestConnection = async () => {
    // Save R2 settings first
    try {
      await updateDoc("VMS Settings", "VMS Settings", r2Form)
      await testConnection({})
      toast.success("R2 connection successful")
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Connection failed"
      toast.error(message)
    }
  }

  const handleInvite = async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    try {
      await inviteByEmail({
        emails: trimmed,
        roles: ["Video Manager"],
        redirect_to_path: "/vms",
        app_name: "vms",
      })
      toast.success(`Invitation sent to ${trimmed}`)
      setEmail("")
      mutateInvites()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to send invitation"
      toast.error(message)
    }
  }

  const handleCancelInvite = async (name: string, inviteEmail: string) => {
    try {
      await cancelInvitation({ name, app_name: "vms" })
      toast.success(`Invitation to ${inviteEmail} cancelled`)
      mutateInvites()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to cancel"
      toast.error(message)
    }
  }

  const handleSaveAndNext = async () => {
    try {
      if (step === 0) {
        // Save R2 credentials
        await updateDoc("VMS Settings", "VMS Settings", r2Form)
      } else if (step === 2) {
        // Save upload settings
        await updateDoc("VMS Settings", "VMS Settings", {
          max_file_size: maxFileSizeMB * MB_TO_BYTES,
        })
      } else if (step === 3) {
        // Save file formats
        const extensions = extensionTags.map((t) => t.text).join(",")
        await updateDoc("VMS Settings", "VMS Settings", {
          allowed_extensions: extensions,
        })
      }

      if (step < STEPS.length - 1) {
        setStep(step + 1)
      } else {
        // Final step — mark setup complete
        await completeSetup({})
        toast.success("Setup complete!")
        onComplete()
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save"
      toast.error(message)
    }
  }

  if (settingsLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    )
  }

  const currentStep = STEPS[step]

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Logo + Welcome */}
        <div className="mb-8 text-center">
          <img
            src="/assets/vms/frontend/vms-logo.png"
            alt="VMS"
            className="mx-auto mb-4 size-12"
          />
          <h1 className="text-xl font-semibold tracking-tight">Set up your workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Let's get VMS configured in a few quick steps.
          </p>
        </div>

        {/* Step indicators */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => i < step && setStep(i)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary/10 text-primary cursor-pointer"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {i < step && (
                <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-3.5" />
              )}
              {s.label}
            </button>
          ))}
        </div>

        {/* Step content */}
        <div className="rounded-xl border border-border bg-card p-6">
          {currentStep.id === "storage" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Cloudflare R2 Credentials</h2>
                <p className="text-xs text-muted-foreground">
                  Connect your R2 bucket for video storage.
                </p>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="r2_account_id" className="text-xs">Account ID</Label>
                  <Input
                    id="r2_account_id"
                    value={r2Form.r2_account_id}
                    onChange={(e) => handleR2Change("r2_account_id", e.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="r2_access_key_id" className="text-xs">Access Key ID</Label>
                    <Input
                      id="r2_access_key_id"
                      value={r2Form.r2_access_key_id}
                      onChange={(e) => handleR2Change("r2_access_key_id", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="r2_secret_access_key" className="text-xs">Secret Access Key</Label>
                    <Input
                      id="r2_secret_access_key"
                      type="password"
                      value={r2Form.r2_secret_access_key}
                      onChange={(e) => handleR2Change("r2_secret_access_key", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="r2_bucket_name" className="text-xs">Bucket Name</Label>
                    <Input
                      id="r2_bucket_name"
                      value={r2Form.r2_bucket_name}
                      onChange={(e) => handleR2Change("r2_bucket_name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="r2_public_url" className="text-xs">Public URL (optional)</Label>
                    <Input
                      id="r2_public_url"
                      placeholder="https://cdn.example.com"
                      value={r2Form.r2_public_url}
                      onChange={(e) => handleR2Change("r2_public_url", e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing || !r2Form.r2_account_id || !r2Form.r2_bucket_name}
                >
                  {testing ? "Testing..." : "Test Connection"}
                </Button>
              </div>
            </div>
          )}

          {currentStep.id === "team" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Invite Your Team</h2>
                <p className="text-xs text-muted-foreground">
                  Add team members who'll manage videos. You can skip this and invite later.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="email@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleInvite()
                  }}
                  className="flex-1"
                />
                <Button onClick={handleInvite} disabled={inviting || !email.trim()} size="sm">
                  <HugeiconsIcon icon={SentIcon} strokeWidth={2} className="size-4 mr-1.5" />
                  {inviting ? "Sending..." : "Invite"}
                </Button>
              </div>
              {pendingInvites.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Pending Invitations</p>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {pendingInvites.map((invite) => (
                      <div
                        key={invite.name}
                        className="flex items-center justify-between px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                            {invite.email[0].toUpperCase()}
                          </div>
                          <span className="text-sm">{invite.email}</span>
                          <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0"
                          onClick={() => handleCancelInvite(invite.name, invite.email)}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep.id === "uploads" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Upload Settings</h2>
                <p className="text-xs text-muted-foreground">
                  Set the maximum file size for uploads.
                </p>
              </div>
              <div className="space-y-4">
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
                    <Label htmlFor="wizard_custom_mb" className="text-xs text-muted-foreground whitespace-nowrap">
                      Custom (MB)
                    </Label>
                    <Input
                      id="wizard_custom_mb"
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
              </div>
            </div>
          )}

          {currentStep.id === "formats" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Allowed File Formats</h2>
                <p className="text-xs text-muted-foreground">
                  Choose which video formats can be uploaded. Type an extension and press Enter.
                </p>
              </div>
              <div>
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
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
          >
            Back
          </Button>
          <div className="flex gap-2">
            {step === 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(step + 1)}
              >
                Skip
              </Button>
            )}
            <Button size="sm" onClick={handleSaveAndNext} disabled={saving}>
              {saving ? "Saving..." : step === STEPS.length - 1 ? "Finish Setup" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
