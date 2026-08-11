'use client'

import { useEffect, useState } from 'react'
import { Copy, HardDrive, FileSearch, Loader2, RotateCcw, AlertTriangle, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { apiGetStats, apiGetInsights, type DashboardStats, type InsightsData, type DuplicatePair, type StaleFile } from '@/lib/api'
import { formatBytes } from '@/lib/types'

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, loading }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; loading?: boolean
}) {
  return (
    <Card className="bg-card border border-border rounded-lg shadow-sm">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            {loading
              ? <div className="h-8 w-16 mt-1 animate-pulse rounded bg-muted" />
              : <p className="text-2xl font-bold text-foreground">{value}</p>}
            {sub && !loading && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4">
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted ml-auto" />
        </div>
      ))}
    </div>
  )
}

// ─── No-data state ────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <FolderOpen className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

// ─── Duplicates ───────────────────────────────────────────────────────────────

function DuplicatesCard({ pairs, loading }: { pairs: DuplicatePair[]; loading: boolean }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const visible = pairs.filter(p => !dismissed.has(p.id))

  return (
    <Card className="bg-card border border-border rounded-lg shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Potential Duplicates</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-0.5">
              Files with identical size and extension found across your scans
            </CardDescription>
          </div>
          {!loading && visible.length > 0 && (
            <Badge variant="secondary" className="shrink-0">{visible.length} pairs</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <SkeletonRows /> : visible.length === 0 ? (
          <EmptyState label={pairs.length === 0 ? 'No duplicates detected. Scan more folders to analyse.' : 'All duplicates reviewed.'} />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map(pair => (
              <li key={pair.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="font-medium text-foreground truncate">{pair.fileA.name}</span>
                      <Badge variant="secondary" className="shrink-0 text-xs">{formatBytes(pair.fileA.size)}</Badge>
                      <span className="text-muted-foreground text-xs shrink-0">{pair.fileA.scan_date}</span>
                    </div>
                    <div className="flex items-center gap-1.5 my-1 text-xs text-muted-foreground">
                      <Copy className="h-3 w-3" />
                      <span>{pair.similarity === 'name-variant' ? 'name variant' : 'exact size match'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="font-medium text-foreground truncate">{pair.fileB.name}</span>
                      <Badge variant="secondary" className="shrink-0 text-xs">{formatBytes(pair.fileB.size)}</Badge>
                      <span className="text-muted-foreground text-xs shrink-0">{pair.fileB.scan_date}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setDismissed(prev => new Set([...prev, pair.id]))}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Stale files ──────────────────────────────────────────────────────────────

function StaleFilesCard({ files, loading }: { files: StaleFile[]; loading: boolean }) {
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [visible, setVisible] = useState<StaleFile[]>([])

  useEffect(() => { setVisible(files) }, [files])

  function handleArchive(id: string) {
    setArchivedIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      setVisible(prev => prev.filter(f => f.id !== id))
      setArchivedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }, 600)
  }

  return (
    <Card className="bg-card border border-border rounded-lg shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Stale Files</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-0.5">
              Files unchanged for 90+ days found in your scans
            </CardDescription>
          </div>
          {!loading && visible.length > 0 && (
            <Badge variant="secondary" className="shrink-0">{visible.length} files</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <SkeletonRows count={4} /> : visible.length === 0 ? (
          <EmptyState label={files.length === 0 ? 'No stale files detected. Files unchanged for 90+ days will appear here.' : 'All stale files reviewed.'} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-6 py-2 text-left font-medium text-muted-foreground">File</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Last modified</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Age</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Size</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Category</th>
                <th className="px-6 py-2 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map(file => (
                <tr
                  key={file.id}
                  className={`hover:bg-muted/30 transition-all ${archivedIds.has(file.id) ? 'opacity-40' : 'opacity-100'}`}
                >
                  <td className="px-6 py-3 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {file.days_unchanged > 180 && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="truncate max-w-[180px]" title={file.name}>{file.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(file.modified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{file.days_unchanged}d</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatBytes(file.size)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs">{file.category}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={archivedIds.has(file.id)}
                      onClick={() => handleArchive(file.id)}
                      className="gap-1.5"
                    >
                      <RotateCcw className="size-3" />
                      {archivedIds.has(file.id) ? 'Archived' : 'Archive'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [stats, setStats]           = useState<DashboardStats | null>(null)
  const [insights, setInsights]     = useState<InsightsData | null>(null)
  const [statsLoading, setStatsLoading]     = useState(true)
  const [insightsLoading, setInsightsLoading] = useState(true)

  useEffect(() => {
    apiGetStats()
      .then(setStats).catch(() => {})
      .finally(() => setStatsLoading(false))

    apiGetInsights()
      .then(setInsights).catch(() => {})
      .finally(() => setInsightsLoading(false))
  }, [])

  const pendingProposals = stats
    ? (stats.proposals.auto + stats.proposals.review + stats.proposals.manual)
    : 0
  const topFiles = stats?.top_files ?? []
  const duplicates = insights?.duplicates ?? []
  const staleFiles = insights?.stale_files ?? []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Insights</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Real analysis from your scan history — duplicates, stale files, and space usage.
        </p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={FileSearch}
          label="Files Scanned"
          value={stats?.total_files_scanned ?? 0}
          sub={`across ${stats?.total_scans ?? 0} scans`}
          loading={statsLoading}
        />
        <StatCard
          icon={HardDrive}
          label="Total Scans"
          value={stats?.total_scans ?? 0}
          loading={statsLoading}
        />
        <StatCard
          icon={Copy}
          label="Pending Proposals"
          value={statsLoading ? '—' : pendingProposals}
          sub={statsLoading ? undefined : `${stats?.proposals.auto ?? 0} auto · ${stats?.proposals.review ?? 0} review · ${stats?.proposals.manual ?? 0} manual`}
          loading={statsLoading}
        />
        <StatCard
          icon={AlertTriangle}
          label="Stale Files"
          value={insightsLoading ? '—' : staleFiles.length}
          sub={insightsLoading ? undefined : staleFiles.length > 0 ? `${formatBytes(insights?.stale_size_bytes ?? 0)} recoverable` : 'none detected'}
          loading={insightsLoading}
        />
      </div>

      {/* Large Files — real data */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Large Files</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-0.5">
            Largest files found across your scans
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {statsLoading ? <SkeletonRows /> : topFiles.length === 0 ? (
            <EmptyState label="Scan a folder to see large files." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-2 text-left font-medium text-muted-foreground">File</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Size</th>
                  <th className="px-6 py-2 text-left font-medium text-muted-foreground">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topFiles.map((file, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3 font-medium text-foreground">{file.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatBytes(file.size_bytes)}</td>
                    <td className="px-6 py-3">
                      <Badge variant="secondary" className="text-xs">{file.category}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Duplicates — real data */}
      <DuplicatesCard pairs={duplicates} loading={insightsLoading} />

      {/* Stale files — real data */}
      <StaleFilesCard files={staleFiles} loading={insightsLoading} />

      {/* Space summary */}
      {insights && (insights.duplicate_size_bytes > 0 || insights.stale_size_bytes > 0) && (
        <Card className="bg-card border border-border rounded-lg shadow-sm">
          <CardContent className="flex items-center gap-6 pt-4 pb-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Space you could recover</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Based on duplicates and stale files detected in your scans
              </p>
            </div>
            <div className="flex items-center gap-6 shrink-0 text-right">
              <div>
                <p className="text-xs text-muted-foreground">Duplicates</p>
                <p className="text-base font-bold text-foreground">{formatBytes(insights.duplicate_size_bytes)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Stale files</p>
                <p className="text-base font-bold text-foreground">{formatBytes(insights.stale_size_bytes)}</p>
              </div>
              <div className="border-l border-border pl-6">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-base font-bold text-primary">
                  {formatBytes(insights.duplicate_size_bytes + insights.stale_size_bytes)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
