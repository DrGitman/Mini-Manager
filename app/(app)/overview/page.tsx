'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  Sparkles, FolderOpen,
  CheckCircle, RotateCcw, Lightbulb, ScanLine, Loader2, Bell, Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { timeAgo, formatBytes } from '@/lib/types'
import { apiGetStats, apiGetInsights, apiGetNotifications } from '@/lib/api'
import type { DashboardStats, InsightsData, ApiNotification } from '@/lib/api'

const NOTIF_ICON: Record<string, React.ElementType> = {
  scan: ScanLine, apply: CheckCircle, undo: RotateCcw,
  tip: Lightbulb, agent: Sparkles, system: Bell,
}
function notifIcon(kind: string) { return NOTIF_ICON[kind] ?? Bell }

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, iconClass, loading,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  iconClass?: string
  loading?: boolean
}) {
  return (
    <Card className="bg-card shadow-sm card-lift">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-3">
          <div className={`rounded-md p-2 ${iconClass ?? 'bg-primary/10'}`}>
            <Icon className="h-5 w-5 text-current" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            {loading
              ? <div className="mt-1 h-7 w-12 animate-pulse rounded bg-muted" />
              : <p className="text-2xl font-bold text-foreground">{value}</p>}
            {sub && !loading && (
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function shortFolder(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 2) return path
  return '.../' + parts.slice(-2).join('/')
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentNotifs, setRecentNotifs] = useState<ApiNotification[]>([])

  useEffect(() => {
    Promise.all([
      apiGetStats().then(setStats).catch(e => setError(e.message)),
      apiGetInsights().then(setInsights).catch(() => {}),
      apiGetNotifications().then(r => setRecentNotifs(r.notifications.slice(0, 3))).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const proposals = stats?.proposals ?? { auto: 0, review: 0, manual: 0 }
  const recentScans = stats?.recent_scans ?? []

  const reclaimableBytes =
    (insights?.duplicate_size_bytes ?? 0) + (insights?.stale_size_bytes ?? 0)

  return (
    <div className="grid grid-cols-3 gap-4 items-start">
      {/* ── Stat cards — row 1 ── */}
      <StatCard
        icon={Trash2}
        label="Reclaimable space"
        value={loading ? 0 : formatBytes(reclaimableBytes)}
        sub="from duplicates + stale files"
        iconClass="bg-green-100 text-green-600"
        loading={loading}
      />
      <StatCard
        icon={Sparkles}
        label="Files to review"
        value={proposals.review + proposals.manual}
        sub="need your attention"
        iconClass="bg-amber-100 text-amber-600"
        loading={loading}
      />
      <StatCard
        icon={CheckCircle}
        label="Ready to apply"
        value={proposals.auto}
        sub="high-confidence"
        iconClass="bg-blue-100 text-blue-600"
        loading={loading}
      />

      {/* ── Left content — rows 2+ ── */}
      <div className="col-span-2 space-y-4">

        {/* Recent Scans */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Recent Scans</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="px-6 py-4 text-sm text-destructive">{error}</p>
            ) : recentScans.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <FolderOpen className="size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No scans yet. Scan a folder to get started.</p>
                <Link href="/organize" className={buttonVariants({ size: 'sm', className: 'mt-2' })}>
                  Scan a folder
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentScans.map(scan => (
                  <li key={scan.id} className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/30">
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground" title={scan.folder_path}>
                        {shortFolder(scan.folder_path)}
                      </p>
                      <p className="text-xs text-muted-foreground">{timeAgo(new Date(scan.created_at).getTime())}</p>
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {scan.file_count} {scan.file_count === 1 ? 'file' : 'files'}
                    </span>
                    <span className="w-28 shrink-0 text-right">
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-0">
                        {scan.proposal_count} {scan.proposal_count === 1 ? 'proposal' : 'proposals'}
                      </Badge>
                    </span>
                    <Link href="/organize" className={buttonVariants({ size: 'sm', variant: 'ghost', className: 'w-14 shrink-0 justify-end' })}>
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Link href="/organize" className={buttonVariants({ className: 'flex-1' })}>
                Scan a folder
              </Link>
              <Link href="/history" className={buttonVariants({ variant: 'outline', className: 'flex-1' })}>
                Undo last batch
              </Link>
              <Link href="/insights" className={buttonVariants({ variant: 'outline', className: 'flex-1' })}>
                View Insights
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Right rail — rows 2+ ── */}
      <div className="space-y-4">

        {/* AI Proposals summary */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">AI Proposals</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-5 animate-pulse rounded bg-muted" />)}
              </div>
            ) : (proposals.auto + proposals.review + proposals.manual) === 0 ? (
              <p className="text-sm text-muted-foreground">
                No proposals yet.{' '}
                <Link href="/organize" className="text-primary hover:underline">Scan a folder</Link> to generate them.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Auto-apply (&ge;0.85)</span>
                  <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-100">
                    {proposals.auto} files
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Review (0.70-0.85)</span>
                  <Badge className="bg-yellow-100 text-yellow-700 border-0 hover:bg-yellow-100">
                    {proposals.review} files
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Needs input (&lt;0.70)</span>
                  <Badge className="bg-red-100 text-red-700 border-0 hover:bg-red-100">
                    {proposals.manual} files
                  </Badge>
                </div>
                <Link href="/organize" className="mt-1 text-sm text-primary hover:underline">
                  Review proposals
                </Link>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Recent Alerts</CardTitle>
            <Link href="/notifications" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentNotifs.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentNotifs.map(n => {
                  const Icon = notifIcon(n.kind)
                  return (
                    <li key={n.id} className="flex items-start gap-3 px-5 py-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-foreground">{n.title}</p>
                          {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(new Date(n.created_at).getTime())}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
