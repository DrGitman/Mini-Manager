'use client'

import { useState } from 'react'
import {
  ScanLine,
  CheckCircle,
  RotateCcw,
  Lightbulb,
  Bell,
  FileX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DEMO_NOTIFICATIONS } from '@/lib/demo-data'
import { timeAgo } from '@/lib/types'
import type { AppNotification } from '@/lib/types'

// ---------------------------------------------------------------------------
// Additional fake notifications (appended after DEMO_NOTIFICATIONS)
// ---------------------------------------------------------------------------

const DAY = 86400000

const EXTRA_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'nx1',
    title: 'Pro tip: Document explainer',
    body: 'You can ask Mini Manager to explain any contract or PDF in plain English.',
    kind: 'tip',
    read: true,
    createdAt: Date.now() - 4 * DAY,
  },
  {
    id: 'nx2',
    title: 'Scan scheduled',
    body: 'Downloads folder will be auto-scanned tonight at 11 PM.',
    kind: 'scan',
    read: true,
    createdAt: Date.now() - 5 * DAY,
  },
  {
    id: 'nx3',
    title: 'License activated',
    body: 'Your Mini Manager license is active. Thanks for subscribing!',
    kind: 'system',
    read: true,
    createdAt: Date.now() - 7 * DAY,
  },
  {
    id: 'nx4',
    title: 'Large file found',
    body: 'old-backup.zip (800 MB) hasn\'t been opened in 300 days.',
    kind: 'tip',
    read: true,
    createdAt: Date.now() - 8 * DAY,
  },
  {
    id: 'nx5',
    title: 'New batch ready',
    body: '22 proposals ready for your Downloads folder.',
    kind: 'scan',
    read: true,
    createdAt: Date.now() - 10 * DAY,
  },
]

const ALL_NOTIFICATIONS: AppNotification[] = [
  ...DEMO_NOTIFICATIONS,
  ...EXTRA_NOTIFICATIONS,
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type KindConfig = {
  icon: React.ElementType
  bgClass: string
  iconClass: string
}

const KIND_CONFIG: Record<AppNotification['kind'], KindConfig> = {
  scan:   { icon: ScanLine,     bgClass: 'bg-blue-100',   iconClass: 'text-blue-600'   },
  apply:  { icon: CheckCircle,  bgClass: 'bg-green-100',  iconClass: 'text-green-600'  },
  undo:   { icon: RotateCcw,    bgClass: 'bg-purple-100', iconClass: 'text-purple-600' },
  tip:    { icon: Lightbulb,    bgClass: 'bg-amber-100',  iconClass: 'text-amber-600'  },
  system: { icon: Bell,         bgClass: 'bg-gray-100',   iconClass: 'text-gray-500'   },
}

type TabValue = 'all' | 'unread' | 'scans' | 'tips'

function filterNotifications(
  notifications: AppNotification[],
  tab: TabValue,
): AppNotification[] {
  switch (tab) {
    case 'unread': return notifications.filter((n) => !n.read)
    case 'scans':  return notifications.filter((n) => n.kind === 'scan')
    case 'tips':   return notifications.filter((n) => n.kind === 'tip')
    default:       return notifications
  }
}

// ---------------------------------------------------------------------------
// Notification item
// ---------------------------------------------------------------------------

function NotificationItem({
  notification,
  onToggleRead,
}: {
  notification: AppNotification
  onToggleRead: (id: string) => void
}) {
  const cfg = KIND_CONFIG[notification.kind]
  const Icon = cfg.icon

  return (
    <button
      onClick={() => onToggleRead(notification.id)}
      className={`w-full flex items-start gap-4 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/40 ${
        !notification.read ? 'bg-primary/5' : 'bg-card'
      }`}
    >
      {/* Kind icon circle */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.bgClass}`}
      >
        <Icon className={`h-4 w-4 ${cfg.iconClass}`} />
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold leading-snug ${
            notification.read ? 'text-foreground' : 'text-foreground'
          }`}
        >
          {notification.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {notification.body}
        </p>
      </div>

      {/* Timestamp + unread dot */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {timeAgo(notification.createdAt)}
        </span>
        {!notification.read && (
          <span className="h-2 w-2 rounded-full bg-primary" />
        )}
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <FileX className="h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No notifications here</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const [notifications, setNotifications] =
    useState<AppNotification[]>(ALL_NOTIFICATIONS)
  const [activeTab, setActiveTab] = useState<TabValue>('all')

  function handleToggleRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n)),
    )
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const filtered = filterNotifications(notifications, activeTab)

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {notifications.filter((n) => !n.read).length} unread
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
          Mark all read
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="w-full justify-start gap-1">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            {notifications.filter((n) => !n.read).length > 0 && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {notifications.filter((n) => !n.read).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="scans">Scans</TabsTrigger>
          <TabsTrigger value="tips">Tips</TabsTrigger>
        </TabsList>

        {/* Content — shared across all tabs via single filtered list */}
        {(['all', 'unread', 'scans', 'tips'] as TabValue[]).map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            {filtered.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onToggleRead={handleToggleRead}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
