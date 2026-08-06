'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  FileSearch,
  Sparkles,
  HardDrive,
  FolderOpen,
  CheckCircle,
  RotateCcw,
  Lightbulb,
  ScanLine,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { DEMO_NOTIFICATIONS } from '@/lib/demo-data'
import { timeAgo, formatBytes } from '@/lib/types'
import type { AppNotification } from '@/lib/types'

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

interface RecentBatch {
  id: string
  name: string
  folder: string
  timeLabel: string
  opCount: number
  status: 'Applied' | 'Undone'
}

const RECENT_BATCHES: RecentBatch[] = [
  { id: 'b1', name: 'Downloads scan', folder: '~/Downloads', timeLabel: '2 hours ago', opCount: 14, status: 'Applied' },
  { id: 'b2', name: 'Documents scan', folder: '~/Documents', timeLabel: 'Yesterday', opCount: 6, status: 'Applied' },
  { id: 'b3', name: 'Desktop scan', folder: '~/Desktop', timeLabel: '3 days ago', opCount: 9, status: 'Undone' },
  { id: 'b4', name: 'Downloads scan', folder: '~/Downloads', timeLabel: '1 week ago', opCount: 22, status: 'Applied' },
]

const LARGEST_FILES = [
  { name: 'vacation_video.mp4', sizeBytes: 180 * 1024 * 1024 },
  { name: 'old-backup.zip', sizeBytes: 800 * 1024 * 1024 },
  { name: 'meeting-recording.mp3', sizeBytes: 47 * 1024 * 1024 },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  iconClass?: string
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
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function notificationIcon(kind: AppNotification['kind']) {
  switch (kind) {
    case 'scan':   return ScanLine
    case 'apply':  return CheckCircle
    case 'tip':    return Lightbulb
    case 'undo':   return RotateCcw
    default:       return FolderOpen
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const [batches, setBatches] = useState<RecentBatch[]>(RECENT_BATCHES)

  function handleUndo(id: string) {
    setBatches((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: 'Undone' } : b)),
    )
  }

  const topThreeNotifications = DEMO_NOTIFICATIONS.slice(0, 3)

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* ------------------------------------------------------------------ */}
      {/* LEFT COLUMN (2/3)                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="col-span-2 flex flex-col gap-6">
        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={FileSearch} label="Files Scanned" value={25} />
          <StatCard
            icon={Sparkles}
            label="Ready to Organize"
            value={18}
            iconClass="bg-green-100 text-green-600"
          />
          <StatCard
            icon={HardDrive}
            label="Space Reclaimable"
            value="18.4 GB"
            iconClass="bg-amber-100 text-amber-600"
          />
        </div>

        {/* Recent Activity */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            <Link
              href="/history"
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {batches.map((batch) => (
                <li
                  key={batch.id}
                  className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/30"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {batch.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {batch.folder} · {batch.timeLabel}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {batch.opCount} files
                  </span>
                  <Badge
                    variant="secondary"
                    className={
                      batch.status === 'Applied'
                        ? 'bg-green-100 text-green-700 border-0'
                        : 'bg-gray-100 text-gray-500 border-0'
                    }
                  >
                    {batch.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={batch.status === 'Undone'}
                    onClick={() => handleUndo(batch.id)}
                    className="shrink-0"
                  >
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button className="flex-1">Scan Downloads</Button>
              <Link href="/rules" className={buttonVariants({ variant: 'outline', className: 'flex-1' })}>Open Rules</Link>
              <Link href="/insights" className={buttonVariants({ variant: 'outline', className: 'flex-1' })}>View Insights</Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* RIGHT COLUMN (1/3)                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="col-span-1 flex flex-col gap-6">
        {/* AI Proposals summary */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">AI Proposals</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Auto-apply (≥0.85)</span>
              <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-100">
                12 files
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Review (0.70–0.85)</span>
              <Badge className="bg-yellow-100 text-yellow-700 border-0 hover:bg-yellow-100">
                4 files
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Needs input (&lt;0.70)</span>
              <Badge className="bg-red-100 text-red-700 border-0 hover:bg-red-100">
                2 files
              </Badge>
            </div>
            <Link
              href="/organize"
              className="mt-1 text-sm text-primary hover:underline"
            >
              Review proposals →
            </Link>
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Recent Alerts</CardTitle>
            <Link
              href="/notifications"
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {topThreeNotifications.map((n) => {
                const Icon = notificationIcon(n.kind)
                return (
                  <li key={n.id} className="flex items-start gap-3 px-5 py-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-foreground">
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(n.createdAt)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        {/* Storage */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Storage</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">18.4 GB reclaimable</p>
              <p className="text-xs text-muted-foreground mb-2">67 GB / 256 GB used</p>
              <Progress value={(67 / 256) * 100} className="h-2" />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Largest files
              </p>
              <ul className="flex flex-col gap-2">
                {LARGEST_FILES.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate text-foreground">{f.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      {formatBytes(f.sizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
