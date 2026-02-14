import { useFrappePostCall, useFrappeGetCall } from "frappe-react-sdk"
import { useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, SentIcon } from "@hugeicons/core-free-icons"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

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


export function UsersSection() {
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
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="divide-y divide-border rounded-lg border border-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        </div>
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
