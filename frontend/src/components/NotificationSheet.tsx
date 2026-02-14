import { useCallback } from "react"
import { useFrappeGetCall, useFrappePostCall, useFrappeDocTypeEventListener } from "frappe-react-sdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { Notification01Icon, CheckListIcon } from "@hugeicons/core-free-icons"
import { formatDistanceToNow } from "date-fns"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"

interface NotificationLog {
  name: string
  subject: string
  email_content: string | null
  type: string
  read: 0 | 1
  from_user: string
  document_type: string | null
  document_name: string | null
  creation: string
  link: string | null
}

interface UserInfo {
  [key: string]: {
    fullname: string
    image: string | null
  }
}

interface NotificationLogsResponse {
  notification_logs: NotificationLog[]
  user_info: UserInfo
}

export function useNotifications() {
  const { data, isLoading, mutate } = useFrappeGetCall<{
    message: NotificationLogsResponse
  }>(
    "frappe.desk.doctype.notification_log.notification_log.get_notification_logs",
    { limit: 50 },
    undefined,
    {
      revalidateOnFocus: true,
      dedupingInterval: 30000,
    }
  )

  // Real-time: revalidate when a new Notification Log is created
  useFrappeDocTypeEventListener("Notification Log", useCallback(() => {
    mutate()
  }, [mutate]))

  const logs = data?.message?.notification_logs ?? []
  const userInfo = data?.message?.user_info ?? {}
  const unreadCount = logs.filter((n) => !n.read).length

  return { logs, userInfo, unreadCount, isLoading, mutate }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function NotificationItem({
  notification,
  userInfo,
  onMarkAsRead,
}: {
  notification: NotificationLog
  userInfo: UserInfo
  onMarkAsRead: (name: string) => void
}) {
  const user = userInfo[notification.from_user]
  const isUnread = !notification.read

  const handleClick = () => {
    if (isUnread) {
      onMarkAsRead(notification.name)
    }
    // Navigate to the linked document if available
    if (notification.link) {
      window.location.href = notification.link
    } else if (notification.document_type && notification.document_name) {
      window.location.href = `/app/${notification.document_type.toLowerCase().replace(/ /g, "-")}/${notification.document_name}`
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
        isUnread ? "bg-primary/5" : ""
      }`}
    >
      <Avatar size="sm" className="mt-0.5 shrink-0">
        {user?.image && <AvatarImage src={user.image} />}
        <AvatarFallback>
          {user ? getInitials(user.fullname) : "?"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm leading-snug ${isUnread ? "font-medium text-foreground" : "text-muted-foreground"}`}
            dangerouslySetInnerHTML={{ __html: notification.subject }}
          />
          {isUnread && (
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(notification.creation), {
            addSuffix: true,
          })}
        </p>
      </div>
    </button>
  )
}

export function NotificationSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { logs, userInfo, unreadCount, isLoading, mutate } = useNotifications()
  const { call: markAllAsRead, loading: markingAll } = useFrappePostCall(
    "frappe.desk.doctype.notification_log.notification_log.mark_all_as_read"
  )
  const { call: markAsRead } = useFrappePostCall(
    "frappe.desk.doctype.notification_log.notification_log.mark_as_read"
  )

  const unreadLogs = logs.filter((n) => !n.read)

  const handleMarkAllAsRead = async () => {
    await markAllAsRead({})
    mutate()
  }

  const handleMarkAsRead = async (docname: string) => {
    await markAsRead({ docname })
    mutate()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col p-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b border-border px-4 py-3">
          <SheetTitle>Notifications</SheetTitle>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markingAll}
              className="mr-8 text-xs"
            >
              <HugeiconsIcon
                icon={CheckListIcon}
                strokeWidth={2}
                className="size-4"
              />
              Mark all as read
            </Button>
          )}
        </SheetHeader>

        <Tabs defaultValue="unread" className="flex flex-1 flex-col overflow-hidden">
          <div className="px-4 pt-2">
            <TabsList>
              <TabsTrigger value="unread">
                Unread
                {unreadCount > 0 && (
                  <Badge variant="default" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="size-5" />
            </div>
          ) : (
            <>
              <TabsContent value="unread" className="flex-1 overflow-hidden">
                {unreadLogs.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-6">
                    <Empty className="border-0">
                      <EmptyMedia variant="icon">
                        <HugeiconsIcon icon={Notification01Icon} strokeWidth={1.5} />
                      </EmptyMedia>
                      <EmptyTitle>All caught up</EmptyTitle>
                      <EmptyDescription>No unread notifications</EmptyDescription>
                    </Empty>
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    {unreadLogs.map((n) => (
                      <NotificationItem
                        key={n.name}
                        notification={n}
                        userInfo={userInfo}
                        onMarkAsRead={handleMarkAsRead}
                      />
                    ))}
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="all" className="flex-1 overflow-hidden">
                {logs.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-6">
                    <Empty className="border-0">
                      <EmptyMedia variant="icon">
                        <HugeiconsIcon icon={Notification01Icon} strokeWidth={1.5} />
                      </EmptyMedia>
                      <EmptyTitle>No notifications</EmptyTitle>
                      <EmptyDescription>
                        Notifications will appear here
                      </EmptyDescription>
                    </Empty>
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    {logs.map((n) => (
                      <NotificationItem
                        key={n.name}
                        notification={n}
                        userInfo={userInfo}
                        onMarkAsRead={handleMarkAsRead}
                      />
                    ))}
                  </ScrollArea>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
