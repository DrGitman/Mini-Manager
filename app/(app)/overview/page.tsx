'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  FileSearch, Sparkles, HardDrive, FolderOpen,
  CheckCircle, RotateCcw, Lightbulb, ScanLine, Loader2, Bell,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { timeAgo, formatBytes } from '@/lib/types'
import { apiGetStats, apiGetNotifications } from '@/lib/api'
import type { DashboardStats, ApiNotification } from '@/lib/api'

const NOTIF_ICON: Record<string, React.ElementType> = {
  scan: ScanLine, apply: CheckCircle, undo: RotateCcw,
  tip: Lightbulb, agent: Sparkles, system: Bell,
}
function notifIcon(kind: string) { return NOTIF_ICON[kind] ?? Bell }

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, iconClass, loading,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  iconClass?: string
  loading?: boolean
}) {
  return (
    <Card className="bg-card shadow-sm card-lift">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-3">
          <div className={`rounded-md p-2 ${iconClass ?? 'bg-primary/10'}`}>
            <Icon className={`h-5 w-5 ${iconClass ? 'text-current' : 'text-primary'}`} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            {loading
              ? <div className="mt-1 h-7 w-12 animate-pulse rounded bg-muted" />
              : <p className="text-2xl font-bold text-foreground">{value}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function shortFolder(path: string): string {
  // Show last two path segments for readability
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 2) return path
  return '…/' + parts.slice(-2).join('/')
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentNotifs, setRecentNotifs] = useState<ApiNotification[]>([])

  useEffect(() => {
    Promise.all([
      apiGetStats().then(setStats).catch(e => setError(e.message)),
      apiGetNotifications().then(r => setRecentNotifs(r.notifications.slice(0, 3))).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const filesScanned = stats?.total_files_scanned ?? 0
  const readyToOrganise = stats?.ready_to_organise ?? 0
  const proposals = stats?.proposals ?? { auto: 0, review: 0, manual: 0 }
  const recentScans = stats?.recent_scans ?? []
  const topFiles = stats?.top_files ?? []

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* ------------------------------------------------------------------ */}
      {/* LEFT COLUMN                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="col-span-2 flex flex-col gap-6">

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            icon={FileSearch}
            label="Files Scanned"
            value={filesScanned}
            loading={loading}
          />
          <StatCard
            icon={Sparkles}
            label="Ready to Organise"
            value={readyToOrganise}
            iconClass="bg-green-100 text-green-600"
            loading={loading}
          />
          <StatCard
            icon={HardDrive}
            label="Total Scans"
            value={stats?.total_scans ?? 0}
            iconClass="bg-amber-100 text-amber-600"
            loading={loading}
          />
        </div>

        {/* Recent Activity */}
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
                <p className="text-sm text-muted-foreground">No scans yet — scan a folder to get started.</p>
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
                      <p className="text-xs text-muted-foreground">
                        {timeAgo(new Date(scan.created_at).getTime())}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {scan.file_count} files
                    </span>
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-0">
                      {scan.proposal_count} proposals
                    </Badge>
                    <Link href="/organize" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
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
              <Link href="/insights" className={buttonVariants({ variant: 'outline', className: 'flex-1' })}>
                View Insights
              </Link>
              <Link href="/rules" className={buttonVariants({ variant: 'outline', className: 'flex-1' })}>
                Rules
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* RIGHT COLUMN                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="col-span-1 flex flex-col gap-6">

        {/* AI Proposals summary — real data from latest scan */}
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
                  <span className="text-sm text-muted-foreground">Auto-apply (≥0.85)</span>
                  <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-100">
                    {proposals.auto} files
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Review (0.70–0.85)</span>
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
                  Review proposals →
                </Link>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Alerts — still from notifications system */}
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

        {/* Top files from latest scan */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Largest Files</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-4 animate-pulse rounded bg-muted" />)}
              </div>
            ) : topFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Scan a folder to see file sizes.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {topFiles.map(f => (
                  <li key={f.name} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground" title={f.name}>{f.name}</p>
                      <p className="text-[11px] text-muted-foreground">{f.category}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(f.size_bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
