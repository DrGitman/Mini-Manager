'use client'

import { useEffect, useState } from 'react'
import {
  ScanLine, CheckCircle, RotateCcw, Lightbulb,
  Bell, FileX, Loader2, Trash2, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { timeAgo } from '@/lib/types'
import {
  apiGetNotifications, apiToggleRead, apiMarkAllRead, apiDeleteNotification,
} from '@/lib/api'
import type { ApiNotification } from '@/lib/api'

// ─── Config ───────────────────────────────────────────────────────────────────

type KindConfig = { icon: React.ElementType; bgClass: string; iconClass: string }

const KIND_CONFIG: Record<string, KindConfig> = {
  scan:   { icon: ScanLine,    bgClass: 'bg-blue-100',   iconClass: 'text-blue-600'   },
  apply:  { icon: CheckCircle, bgClass: 'bg-green-100',  iconClass: 'text-green-600'  },
  undo:   { icon: RotateCcw,   bgClass: 'bg-purple-100', iconClass: 'text-purple-600' },
  tip:    { icon: Lightbulb,   bgClass: 'bg-amber-100',  iconClass: 'text-amber-600'  },
  agent:  { icon: Sparkles,    bgClass: 'bg-primary/10', iconClass: 'text-primary'    },
  system: { icon: Bell,        bgClass: 'bg-muted',      iconClass: 'text-muted-foreground' },
}

function kindConfig(kind: string): KindConfig {
  return KIND_CONFIG[kind] ?? KIND_CONFIG.system
}

type TabValue = 'all' | 'unread' | 'scans' | 'agent'

function filterNotifications(list: ApiNotification[], tab: TabValue): ApiNotification[] {
  switch (tab) {
    case 'unread': return list.filter(n => !n.read)
    case 'scans':  return list.filter(n => n.kind === 'scan')
    case 'agent':  return list.filter(n => n.kind === 'agent' || n.kind === 'apply')
    default:       return list
  }
}

// ─── Notification item ────────────────────────────────────────────────────────

function NotificationItem({
  notification, onToggleRead, onDelete,
}: {
  notification: ApiNotification
  onToggleRead: (id: string) => void
  onDelete: (id: string) => void
}) {
  const cfg = kindConfig(notification.kind)
  const Icon = cfg.icon

  return (
    <div className={`group flex items-start gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-muted/40 ${
      !notification.read ? 'bg-primary/5' : 'bg-card'
    }`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.bgClass}`}>
        <Icon className={`h-4 w-4 ${cfg.iconClass}`} />
      </div>

      <button
        onClick={() => onToggleRead(notification.id)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="text-sm font-semibold leading-snug text-foreground">
          {notification.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {notification.body}
        </p>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {timeAgo(new Date(notification.created_at).getTime())}
        </span>
        <div className="flex items-center gap-1">
          {!notification.read && (
            <span className="h-2 w-2 rounded-full bg-primary" />
          )}
          <button
            onClick={() => onDelete(notification.id)}
            className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive transition-all"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <FileX className="h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No notifications here</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<ApiNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabValue>('all')

  useEffect(() => {
    apiGetNotifications()
      .then(res => setNotifications(res.notifications))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggleRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !n.read } : n))
    await apiToggleRead(id).catch(() => {
      // revert on error
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !n.read } : n))
    })
  }

  async function handleMarkAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    await apiMarkAllRead().catch(() => {})
  }

  async function handleDelete(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await apiDeleteNotification(id).catch(() => {
      // if delete failed just leave it gone — stale list is fine
    })
  }

  const unreadCount = notifications.filter(n => !n.read).length
  const filtered = filterNotifications(notifications, activeTab)

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${unreadCount} unread`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
          Mark all read
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabValue)}>
        <TabsList className="w-full justify-start gap-1">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            {unreadCount > 0 && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="scans">Scans</TabsTrigger>
          <TabsTrigger value="agent">Agent</TabsTrigger>
        </TabsList>

        {(['all', 'unread', 'scans', 'agent'] as TabValue[]).map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="text-sm text-destructive py-8 text-center">{error}</p>
            ) : filtered.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map(n => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onToggleRead={handleToggleRead}
                    onDelete={handleDelete}
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
