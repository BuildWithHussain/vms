import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { useState, useEffect } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"

interface YouTubeStatus {
  connected: boolean
  channel_name: string
  has_credentials: boolean
}

export function YouTubeSection() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [redirectUri, setRedirectUri] = useState("")
  const [authUrl, setAuthUrl] = useState("")

  const {
    data: statusData,
    isLoading,
    mutate,
  } = useFrappeGetCall<{ message: YouTubeStatus }>(
    "vms.youtube.get_youtube_status",
    undefined,
    "youtube-status",
    { revalidateOnFocus: false }
  )

  const { call: callConnect, loading: connecting } = useFrappePostCall("vms.youtube.connect_youtube")
  const { call: callFinalize, loading: finalizing } = useFrappePostCall("vms.youtube.finalize_youtube_connection")
  const { call: callDisconnect, loading: disconnecting } = useFrappePostCall("vms.youtube.disconnect_youtube")

  const status = statusData?.message

  // Handle OAuth redirect callback
  useEffect(() => {
    if (searchParams.get("youtube_connected") === "1") {
      searchParams.delete("youtube_connected")
      searchParams.delete("settings")
      setSearchParams(searchParams, { replace: true })

      callFinalize({})
        .then(() => {
          toast.success("YouTube connected successfully")
          mutate()
        })
        .catch(() => {
          toast.error("Failed to finalize YouTube connection")
        })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Please enter both Client ID and Client Secret")
      return
    }

    try {
      const res = await callConnect({ client_id: clientId.trim(), client_secret: clientSecret.trim() })
      const data = (res as { message: { auth_url: string; redirect_uri: string } }).message
      // Show redirect URI so user can verify it's registered, then redirect
      setRedirectUri(data.redirect_uri)
      setAuthUrl(data.auth_url)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to connect YouTube"
      toast.error(message)
    }
  }

  const handleProceedToGoogle = () => {
    if (authUrl) {
      window.location.href = authUrl
    }
  }

  const handleDisconnect = async () => {
    try {
      await callDisconnect({})
      setClientId("")
      setClientSecret("")
      setRedirectUri("")
      setAuthUrl("")
      toast.success("YouTube disconnected")
      mutate()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to disconnect YouTube"
      toast.error(message)
    }
  }

  if (isLoading) {
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
              <h3 className="text-sm font-semibold">YouTube</h3>
              <p className="text-xs text-muted-foreground">
                Connect your YouTube account to upload videos directly from VMS.
              </p>
            </div>

            {status?.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                  <div className="size-2 rounded-full bg-green-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Connected</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {status.channel_name}
                    </p>
                  </div>
                </div>
              </div>
            ) : redirectUri ? (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 space-y-2">
                  <p className="text-xs font-medium">
                    Add this redirect URI in your Google Cloud Console before continuing:
                  </p>
                  <code className="block text-xs bg-background rounded px-2 py-1.5 break-all select-all border">
                    {redirectUri}
                  </code>
                  <p className="text-xs text-muted-foreground">
                    Go to Credentials &rarr; your OAuth Client &rarr; Authorized redirect URIs &rarr; paste &rarr; Save.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="youtube_client_id" className="text-xs">
                      Client ID
                    </Label>
                    <Input
                      id="youtube_client_id"
                      placeholder="Enter OAuth Client ID"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="youtube_client_secret" className="text-xs">
                      Client Secret
                    </Label>
                    <Input
                      id="youtube_client_secret"
                      type="password"
                      placeholder="Enter OAuth Client Secret"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Create OAuth credentials in the{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Google Cloud Console
                  </a>
                  . Enable the YouTube Data API v3.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 md:px-6">
        {status?.connected ? (
          <Button variant="destructive" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? "Disconnecting..." : "Disconnect YouTube"}
          </Button>
        ) : redirectUri ? (
          <>
            <Button
              variant="outline"
              onClick={() => { setRedirectUri(""); setAuthUrl("") }}
            >
              Back
            </Button>
            <Button onClick={handleProceedToGoogle}>
              Continue to Google
            </Button>
          </>
        ) : (
          <Button onClick={handleConnect} disabled={connecting || finalizing}>
            {connecting ? "Setting up..." : finalizing ? "Finalizing..." : "Connect YouTube"}
          </Button>
        )}
      </div>
    </>
  )
}
