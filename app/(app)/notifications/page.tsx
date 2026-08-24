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
import { fetchEscalations, type Escalation } from '@/lib/escalations'
import { ShieldQuestion } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

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


const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

function token(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('mm.token') ?? sessionStorage.getItem('mm.token')
}

/**
 * An escalation, rendered as a notification that happens to need an answer.
 *
 * Deliberately the same row shape as everything else on this screen — this is
 * not a different kind of thing, it is an Agent notification where the agent is
 * waiting rather than reporting. The only difference is the buttons.
 *
 * Three answers, because "not now" is a real one. With only yes or no, people
 * pick one they do not mean just to clear the badge.
 */
function EscalationItem({
  escalation, onAnswered, onError,
}: {
  escalation: Escalation
  onAnswered: (id: string) => void
  onError: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const files = escalation.files ?? []

  async function answer(choice: string) {
    setBusy(true)
    try {
      const res = await fetch(`${BASE}/api/v1/escalations/${escalation.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ choice }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      // Removed only once the server confirms — dropping it optimistically
      // would hide a decision that was never recorded.
      if (data.resolved) onAnswered(escalation.id)
      else onError('That one was already answered.')
    } catch {
      onError('Could not save that. It is still waiting for you.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="group flex items-start gap-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/10">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
        <ShieldQuestion className="h-4 w-4 text-amber-600" />
      </div>

      <div className="min-w-0 flex-1">
        {/* The agent's own sentence, not a category. */}
        <p className="text-sm leading-[1.55] text-foreground">
          {escalation.agent_note || 'I stopped and would rather you decided.'}
        </p>

        {files.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {files.map((f, i) => (
              <li key={i} className="truncate text-xs font-mono text-muted-foreground">
                {f.file}
                {f.folder ? <span className="text-muted-foreground/60"> · {f.folder}</span> : null}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {['Apply it', 'Leave it', 'Ask me later'].map((choice, i) => (
            <button
              key={choice}
              onClick={() => answer(choice)}
              disabled={busy}
              className={
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-opacity disabled:opacity-60 ' +
                (i === 0
                  ? 'bg-primary text-white hover:opacity-90'
                  : 'border border-border bg-background text-muted-foreground hover:bg-accent')
              }
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : choice}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {timeAgo(new Date(escalation.created_at).getTime())}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<ApiNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [escalations, setEscalations] = useState<Escalation[]>([])

  // "Review N decisions" links here with ?tab=agent, so it lands on the list
  // that holds them rather than making the user find it.
  const params = useSearchParams()
  const initialTab = (params.get('tab') as TabValue) || 'all'
  const [activeTab, setActiveTab] = useState<TabValue>(
    ['all', 'unread', 'scans', 'agent'].includes(initialTab) ? initialTab : 'all',
  )

  useEffect(() => {
    // Both together: an escalation is an Agent notification that happens to
    // need an answer, so this screen is where it belongs.
    Promise.all([
      apiGetNotifications().then(res => res.notifications).catch(e => { setError(e.message); return [] }),
      fetchEscalations().catch(() => []),
    ])
      .then(([notifs, escs]) => {
        setNotifications(notifs)
        setEscalations(escs)
      })
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

  // An unanswered escalation is unread by definition — it is the thing most
  // actually waiting on the user, so it counts.
  const unreadCount = notifications.filter(n => !n.read).length + escalations.length

  const filtered = filterNotifications(notifications, activeTab)
  // Escalations belong in All, Unread and Agent; Scans is about scanning.
  const shownEscalations = activeTab === 'scans' ? [] : escalations

  function handleAnswered(id: string) {
    setEscalations(prev => prev.filter(e => e.id !== id))
  }

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
            ) : (filtered.length === 0 && (tab === 'scans' ? true : escalations.length === 0)) ? (
              <EmptyState />
            ) : (
              <div className="flex flex-col gap-2">
                {/* Things waiting on the user come first. They are the only
                    rows here that block anything. */}
                {(tab === 'scans' ? [] : escalations).map(e => (
                  <EscalationItem
                    key={e.id}
                    escalation={e}
                    onAnswered={handleAnswered}
                    onError={setError}
                  />
                ))}
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
