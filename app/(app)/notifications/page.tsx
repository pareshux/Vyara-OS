import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Bell } from 'lucide-react'

function timeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  project: 'Project',
  task: 'Task',
  sample_request: 'Sample',
  quotation: 'Quote',
}

export default async function NotificationsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch notifications for current user
  const { data: notifications } = await supabase
    .from('notification')
    .select('id, type, title, body, is_read, entity_type, entity_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Mark all unread notifications as read (fire and forget)
  const unreadIds = (notifications ?? []).filter((n) => !n.is_read).map((n) => n.id)
  if (unreadIds.length > 0) {
    await supabase
      .from('notification')
      .update({ is_read: true })
      .in('id', unreadIds)
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          {(notifications ?? []).length === 0
            ? 'No notifications'
            : `${(notifications ?? []).length} notification${(notifications ?? []).length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {(notifications ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Bell className="size-8 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">You&apos;re all caught up.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            New notifications will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(notifications ?? []).map((notification) => (
            <Card key={notification.id}>
              <CardContent className="flex items-start gap-3 py-3">
                <div
                  className={`mt-0.5 size-2 rounded-full shrink-0 ${
                    notification.is_read ? 'bg-transparent' : 'bg-primary'
                  }`}
                />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {notification.title}
                    </p>
                    <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                      {timeAgo(notification.created_at as string)}
                    </span>
                  </div>
                  {notification.body && (
                    <p className="text-sm text-muted-foreground leading-snug">{notification.body}</p>
                  )}
                  {notification.entity_type && (
                    <Badge
                      variant="secondary"
                      className="w-fit text-xs capitalize mt-0.5"
                    >
                      {ENTITY_TYPE_LABELS[notification.entity_type] ?? notification.entity_type}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
