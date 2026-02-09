import { useFrappeGetDoc, useFrappeUpdateDoc, useFrappePostCall, useFrappeGetCall, useFrappeAuth, useFrappeFileUpload } from "frappe-react-sdk"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Settings01Icon, UserGroupIcon, Cancel01Icon, SentIcon, UserCircleIcon, Camera01Icon } from "@hugeicons/core-free-icons"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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

interface VMSUser {
  name: string
  email: string
  full_name: string
  user_image: string | null
  last_active: string | null
}

interface PendingInvitation {
  name: string
  email: string
  roles: string[]
}

const sections = [
  { id: "profile", label: "Profile", icon: UserCircleIcon },
  { id: "general", label: "General", icon: Settings01Icon },
  { id: "users", label: "Users", icon: UserGroupIcon },
] as const


export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useIsMobile()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <Tabs defaultValue="profile" orientation={isMobile ? "horizontal" : "vertical"} className="flex flex-col md:flex-row h-[min(85vh,750px)] gap-0">
          {/* Header + tabs */}
          <div className="shrink-0 border-b border-border bg-muted/30 md:w-48 md:border-b-0 md:border-r">
            <div className="p-4 pb-2">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">Settings</DialogTitle>
                <DialogDescription className="sr-only">
                  Application settings
                </DialogDescription>
              </DialogHeader>
            </div>
            <TabsList className="w-full rounded-none bg-transparent px-2 pb-2 md:flex-col md:items-stretch md:h-auto">
              {sections.map((section) => (
                <TabsTrigger key={section.id} value={section.id} className="gap-2 justify-center md:justify-start">
                  <HugeiconsIcon icon={section.icon} strokeWidth={2} className="size-4" />
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TabsContent value="profile" className="flex flex-1 flex-col overflow-hidden m-0">
              <ProfileSection />
            </TabsContent>
            <TabsContent value="general" className="flex flex-1 flex-col overflow-hidden m-0">
              <GeneralSection />
            </TabsContent>
            <TabsContent value="users" className="flex flex-1 flex-col overflow-hidden m-0">
              <UsersSection />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}


function ProfileSection() {
  const { currentUser } = useFrappeAuth()
  const { call: getValue } = useFrappePostCall("frappe.client.get_value")
  const { call: setValue, loading: saving } = useFrappePostCall("frappe.client.set_value")
  const { upload } = useFrappeFileUpload()

  const [form, setForm] = useState({ first_name: "", last_name: "", full_name: "", user_image: "" })
  const initialForm = useRef({ first_name: "", last_name: "", full_name: "", user_image: "" })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchProfile = async () => {
    if (!currentUser) return
    try {
      const res = await getValue({
        doctype: "User",
        fieldname: ["first_name", "last_name", "full_name", "user_image"],
        filters: { name: currentUser },
      })
      const data = res.message || {}
      const values = {
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        full_name: data.full_name || "",
        user_image: data.user_image || "",
      }
      setForm(values)
      initialForm.current = values
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [currentUser])

  const isDirty =
    form.first_name !== initialForm.current.first_name ||
    form.last_name !== initialForm.current.last_name

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    try {
      await setValue({
        doctype: "User",
        name: currentUser,
        fieldname: {
          first_name: form.first_name,
          last_name: form.last_name,
        },
      })
      // Re-fetch to get the auto-generated full_name
      const res = await getValue({
        doctype: "User",
        fieldname: ["first_name", "last_name", "full_name", "user_image"],
        filters: { name: currentUser },
      })
      const data = res.message || {}
      const values = {
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        full_name: data.full_name || "",
        user_image: data.user_image || "",
      }
      setForm(values)
      initialForm.current = values
      toast.success("Profile updated")
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update profile"
      toast.error(message)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await upload(file, {
        isPrivate: false,
        doctype: "User",
        docname: currentUser!,
        fieldname: "user_image",
      })
      const fileUrl = (res as { file_url: string }).file_url
      // Save immediately like Buzz does
      await setValue({
        doctype: "User",
        name: currentUser,
        fieldname: { user_image: fileUrl },
      })
      setForm((prev) => ({ ...prev, user_image: fileUrl }))
      initialForm.current = { ...initialForm.current, user_image: fileUrl }
      toast.success("Profile photo updated")
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to upload image"
      toast.error(message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleRemoveImage = async () => {
    try {
      await setValue({
        doctype: "User",
        name: currentUser,
        fieldname: { user_image: "" },
      })
      setForm((prev) => ({ ...prev, user_image: "" }))
      initialForm.current = { ...initialForm.current, user_image: "" }
      toast.success("Profile photo removed")
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to remove image"
      toast.error(message)
    }
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading profile...</div>
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 space-y-6">
          {/* Profile Photo */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Profile Photo</h3>
              <p className="text-xs text-muted-foreground">
                Your profile photo visible to other team members.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative group">
                {form.user_image ? (
                  <img
                    src={form.user_image}
                    alt={form.full_name}
                    className="size-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-full bg-muted text-lg font-medium text-muted-foreground">
                    {(form.full_name || currentUser || "?")[0].toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <HugeiconsIcon icon={Camera01Icon} strokeWidth={2} className="size-4 text-white" />
                </button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "Uploading..." : "Change Photo"}
                </Button>
                {form.user_image && (
                  <Button variant="ghost" size="sm" onClick={handleRemoveImage}>
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
          </div>

          {/* Name */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Name</h3>
              <p className="text-xs text-muted-foreground">
                Your full name is auto-generated from first and last name.
              </p>
            </div>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="first_name" className="text-xs">First Name</Label>
                  <Input
                    id="first_name"
                    value={form.first_name}
                    onChange={(e) => handleChange("first_name", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last_name" className="text-xs">Last Name</Label>
                  <Input
                    id="last_name"
                    value={form.last_name}
                    onChange={(e) => handleChange("last_name", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="full_name" className="text-xs">Full Name</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-generated from first and last name.
                </p>
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
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </>
  )
}


function GeneralSection() {
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
    return <div className="p-6 text-muted-foreground">Loading settings...</div>
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


function UsersSection() {
  const { call: inviteByEmail, loading: inviting } = useFrappePostCall(
    "frappe.core.api.user_invitation.invite_by_email"
  )
  const { call: cancelInvitation } = useFrappePostCall(
    "frappe.core.api.user_invitation.cancel_invitation"
  )

  const {
    data: usersData,
    isLoading: usersLoading,
    mutate: mutateUsers,
  } = useFrappeGetCall<VMSUser[]>("vms.api.get_vms_users")

  const {
    data: invitesData,
    isLoading: invitesLoading,
    error: invitesError,
    mutate: mutateInvites,
  } = useFrappeGetCall<PendingInvitation[]>(
    "frappe.core.api.user_invitation.get_pending_invitations",
    { app_name: "vms" }
  )

  const users = usersData?.message || []
  const pendingInvites = invitesData?.message || []
  const loading = usersLoading || invitesLoading
  const isAdmin = !invitesError

  const [email, setEmail] = useState("")

  const refreshAll = () => {
    mutateUsers()
    mutateInvites()
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
      refreshAll()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to send invitation"
      toast.error(message)
    }
  }

  const handleCancel = async (inviteName: string, inviteEmail: string) => {
    try {
      await cancelInvitation({ name: inviteName, app_name: "vms" })
      toast.success(`Invitation to ${inviteEmail} cancelled`)
      refreshAll()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to cancel invitation"
      toast.error(message)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Invite — only visible to admins */}
      {isAdmin && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Invite User</h3>
            <p className="text-xs text-muted-foreground">
              Send an invitation email to add a new Video Manager.
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
            <Button onClick={handleInvite} disabled={inviting || !email.trim()}>
              <HugeiconsIcon icon={SentIcon} strokeWidth={2} className="size-4 mr-1.5" />
              {inviting ? "Sending..." : "Invite"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading users...</div>
      ) : (
        <>
          {/* Pending Invitations — only visible to admins */}
          {isAdmin && pendingInvites.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Pending Invitations</h3>
              <div className="divide-y divide-border rounded-lg border border-border">
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.name}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {invite.email[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm">{invite.email}</p>
                        <Badge variant="secondary" className="mt-0.5 text-[10px]">
                          Pending
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(invite.name, invite.email)}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Users */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              Video Managers{users.length > 0 && ` (${users.length})`}
            </h3>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No users with the Video Manager role yet.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {users.map((user) => (
                  <div
                    key={user.name}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {user.user_image ? (
                      <img
                        src={user.user_image}
                        alt={user.full_name}
                        className="size-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {(user.full_name || user.email)[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {user.full_name || user.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
