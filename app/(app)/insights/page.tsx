'use client'

import { useEffect, useState } from 'react'
import { Copy, HardDrive, FileSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { apiGetStats, type DashboardStats } from '@/lib/api'
import { formatBytes } from '@/lib/types'

interface DuplicatePair {
  id: string
  fileA: { name: string; size: string; date: string }
  fileB: { name: string; size: string; date: string }
  suggestedLabel: string
}

interface StaleFile {
  id: string
  name: string
  lastModified: string
  daysUnchanged: number
  size: string
}

const INITIAL_DUPES: DuplicatePair[] = [
  { id: 'dp1', fileA: { name: 'IMG_4821.HEIC', size: '2.9 MB', date: 'Jun 3' }, fileB: { name: 'IMG_4821-copy.HEIC', size: '2.9 MB', date: 'Jun 3' }, suggestedLabel: 'Keep original / Delete copy' },
  { id: 'dp2', fileA: { name: 'invoice_march_final.pdf', size: '245 KB', date: 'Mar 31' }, fileB: { name: 'invoice_march_final (2).pdf', size: '245 KB', date: 'Apr 1' }, suggestedLabel: 'Keep latest' },
  { id: 'dp3', fileA: { name: 'resume_v7.docx', size: '42 KB', date: 'May 10' }, fileB: { name: 'resume_v7_FINAL_final.docx', size: '44 KB', date: 'May 11' }, suggestedLabel: 'Merge' },
]

const INITIAL_STALE: StaleFile[] = [
  { id: 'sf1', name: 'old-backup.zip',             lastModified: 'Oct 8, 2025',  daysUnchanged: 300, size: '800 MB' },
  { id: 'sf2', name: 'family-photo-christmas.png', lastModified: 'Dec 25, 2025', daysUnchanged: 220, size: '3.1 MB' },
  { id: 'sf3', name: 'DSC04512.jpg',               lastModified: 'Apr 5, 2026',  daysUnchanged: 120, size: '4.7 MB' },
  { id: 'sf4', name: 'lease_agreement_signed.pdf', lastModified: 'Jan 16, 2026', daysUnchanged: 200, size: '1.2 MB' },
  { id: 'sf5', name: 'W2_2024.pdf',                lastModified: 'Feb 14, 2026', daysUnchanged: 160, size: '340 KB' },
  { id: 'sf6', name: 'IMG_20240612.jpg',            lastModified: 'Jun 12, 2026', daysUnchanged: 54,  size: '2.3 MB' },
]

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
            {loading ? <div className="h-8 w-16 mt-1 animate-pulse rounded bg-muted" /> : <p className="text-2xl font-bold text-foreground">{value}</p>}
            {sub && !loading && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function InsightsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [dupes, setDupes] = useState<DuplicatePair[]>(INITIAL_DUPES)
  const [staleFiles, setStaleFiles] = useState<StaleFile[]>(INITIAL_STALE)
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    apiGetStats().then(setStats).catch(() => {}).finally(() => setStatsLoading(false))
  }, [])

  function removeDupe(id: string) {
    setDupes(prev => prev.filter(d => d.id !== id))
  }

  function archiveStale(id: string) {
    setArchivedIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      setStaleFiles(prev => prev.filter(f => f.id !== id))
      setArchivedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }, 700)
  }

  const pendingProposals = stats ? (stats.proposals.auto + stats.proposals.review + stats.proposals.manual) : 0
  const topFiles = stats?.top_files ?? []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Insights</h1>
        <p className="text-muted-foreground mt-1 text-sm">See what&apos;s taking up space and what can be cleaned up.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={FileSearch} label="Files Scanned" value={stats?.total_files_scanned ?? 0} sub={`across ${stats?.total_scans ?? 0} scans`} loading={statsLoading} />
        <StatCard icon={HardDrive} label="Total Scans" value={stats?.total_scans ?? 0} loading={statsLoading} />
        <StatCard icon={Copy} label="Pending Proposals" value={statsLoading ? '—' : pendingProposals} sub={statsLoading ? undefined : `${stats?.proposals.auto ?? 0} auto · ${stats?.proposals.review ?? 0} review · ${stats?.proposals.manual ?? 0} manual`} loading={statsLoading} />
      </div>

      {/* Large Files */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Large Files</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-0.5">Largest files found across your scans</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {statsLoading ? (
            <div className="flex flex-col divide-y divide-border">
              {[1,2,3].map(i => <div key={i} className="flex items-center gap-4 px-6 py-3"><div className="h-4 w-1/2 animate-pulse rounded bg-muted" /><div className="h-4 w-16 animate-pulse rounded bg-muted ml-auto" /></div>)}
            </div>
          ) : topFiles.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">Scan a folder to see large files.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border"><th className="px-6 py-2 text-left font-medium text-muted-foreground">File</th><th className="px-4 py-2 text-left font-medium text-muted-foreground">Size</th><th className="px-6 py-2 text-left font-medium text-muted-foreground">Category</th></tr></thead>
              <tbody className="divide-y divide-border">
                {topFiles.map((file, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3 font-medium text-foreground">{file.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatBytes(file.size_bytes)}</td>
                    <td className="px-6 py-3"><Badge variant="secondary" className="text-xs">{file.category}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Duplicates */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Potential Duplicates</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-0.5">Detected during your last scan — dismiss to clear</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {dupes.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No duplicates found.</p>
          ) : (
            <ul className="divide-y divide-border">
              {dupes.map(pair => (
                <li key={pair.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground truncate">{pair.fileA.name}</span>
                        <Badge variant="secondary" className="shrink-0 text-xs">{pair.fileA.size}</Badge>
                        <span className="text-muted-foreground text-xs shrink-0">{pair.fileA.date}</span>
                      </div>
                      <div className="flex items-center gap-1.5 my-1 text-xs text-muted-foreground"><Copy className="h-3 w-3" /><span>duplicate</span></div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground truncate">{pair.fileB.name}</span>
                        <Badge variant="secondary" className="shrink-0 text-xs">{pair.fileB.size}</Badge>
                        <span className="text-muted-foreground text-xs shrink-0">{pair.fileB.date}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => removeDupe(pair.id)} className="shrink-0">{pair.suggestedLabel}</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Stale Files */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Stale Files</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-0.5">Files unchanged for a long time</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {staleFiles.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No stale files found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border"><th className="px-6 py-2 text-left font-medium text-muted-foreground">File</th><th className="px-4 py-2 text-left font-medium text-muted-foreground">Last modified</th><th className="px-4 py-2 text-left font-medium text-muted-foreground">Days unchanged</th><th className="px-4 py-2 text-left font-medium text-muted-foreground">Size</th><th className="px-6 py-2 text-right font-medium text-muted-foreground">Action</th></tr></thead>
              <tbody className="divide-y divide-border">
                {staleFiles.map(file => (
                  <tr key={file.id} className={`hover:bg-muted/30 transition-all ${archivedIds.has(file.id) ? 'opacity-40' : 'opacity-100'}`}>
                    <td className="px-6 py-3 font-medium text-foreground">{file.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{file.lastModified}</td>
                    <td className="px-4 py-3 text-muted-foreground">{file.daysUnchanged}d</td>
                    <td className="px-4 py-3 text-muted-foreground">{file.size}</td>
                    <td className="px-6 py-3 text-right">
                      <Button size="sm" variant="outline" disabled={archivedIds.has(file.id)} onClick={() => archiveStale(file.id)}>
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
    </div>
  )
}
