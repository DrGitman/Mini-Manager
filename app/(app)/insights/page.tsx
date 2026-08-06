'use client'

import { useState } from 'react'
import { Copy, HardDrive, Clock, MoveRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

// ---------------------------------------------------------------------------
// Types & demo data
// ---------------------------------------------------------------------------

interface LargeFile {
  id: string
  name: string
  size: string
  lastModified: string
  action: string
}

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

const INITIAL_LARGE: LargeFile[] = [
  { id: 'lf1', name: 'old-backup.zip',           size: '800 MB', lastModified: '300 days ago', action: 'Move to Archives' },
  { id: 'lf2', name: 'vacation_video.mp4',        size: '180 MB', lastModified: '90 days ago',  action: 'Move to Videos'  },
  { id: 'lf3', name: 'meeting-recording.mp3',     size: '47 MB',  lastModified: '9 days ago',   action: 'Move to Audio'   },
  { id: 'lf4', name: 'presentation_draft.pptx',   size: '8.2 MB', lastModified: '7 days ago',   action: 'Review'          },
]

const INITIAL_DUPES: DuplicatePair[] = [
  {
    id: 'dp1',
    fileA: { name: 'IMG_4821.HEIC',                  size: '2.9 MB', date: 'Jun 3'  },
    fileB: { name: 'IMG_4821-copy.HEIC',              size: '2.9 MB', date: 'Jun 3'  },
    suggestedLabel: 'Keep original / Delete copy',
  },
  {
    id: 'dp2',
    fileA: { name: 'invoice_march_final.pdf',         size: '245 KB', date: 'Mar 31' },
    fileB: { name: 'invoice_march_final (2).pdf',     size: '245 KB', date: 'Apr 1'  },
    suggestedLabel: 'Keep latest',
  },
  {
    id: 'dp3',
    fileA: { name: 'resume_v7.docx',                  size: '42 KB',  date: 'May 10' },
    fileB: { name: 'resume_v7_FINAL_final.docx',      size: '44 KB',  date: 'May 11' },
    suggestedLabel: 'Merge',
  },
]

const INITIAL_STALE: StaleFile[] = [
  { id: 'sf1', name: 'old-backup.zip',             lastModified: 'Oct 8, 2025',  daysUnchanged: 300, size: '800 MB' },
  { id: 'sf2', name: 'family-photo-christmas.png', lastModified: 'Dec 25, 2025', daysUnchanged: 220, size: '3.1 MB' },
  { id: 'sf3', name: 'DSC04512.jpg',               lastModified: 'Apr 5, 2026',  daysUnchanged: 120, size: '4.7 MB' },
  { id: 'sf4', name: 'lease_agreement_signed.pdf', lastModified: 'Jan 16, 2026', daysUnchanged: 200, size: '1.2 MB' },
  { id: 'sf5', name: 'W2_2024.pdf',                lastModified: 'Feb 14, 2026', daysUnchanged: 160, size: '340 KB' },
  { id: 'sf6', name: 'IMG_20240612.jpg',            lastModified: 'Jun 12, 2026', daysUnchanged: 54,  size: '2.3 MB' },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
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
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InsightsPage() {
  const [largeFiles, setLargeFiles]   = useState<LargeFile[]>(INITIAL_LARGE)
  const [dupes, setDupes]             = useState<DuplicatePair[]>(INITIAL_DUPES)
  const [staleFiles, setStaleFiles]   = useState<StaleFile[]>(INITIAL_STALE)
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())

  function removeLarge(id: string) {
    setLargeFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function removeDupe(id: string) {
    setDupes((prev) => prev.filter((d) => d.id !== id))
  }

  function archiveStale(id: string) {
    setArchivedIds((prev) => new Set([...prev, id]))
    setTimeout(() => {
      setStaleFiles((prev) => prev.filter((f) => f.id !== id))
      setArchivedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 700)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Insights</h1>
        <p className="text-muted-foreground mt-1">
          See what&apos;s taking up space and what can be cleaned up.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={Copy}
          label="Potential duplicates"
          value={`${dupes.length} file pairs`}
        />
        <StatCard
          icon={HardDrive}
          label="Large files (>50 MB)"
          value={`${largeFiles.filter((f) => ['800 MB','180 MB','47 MB'].includes(f.size)).length} files`}
          sub="1.04 GB total"
        />
        <StatCard
          icon={Clock}
          label="Stale files (>6 months)"
          value={`${staleFiles.length} files`}
        />
      </div>

      {/* Large Files */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Large Files</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {largeFiles.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No large files found.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-2 text-left font-medium text-muted-foreground">File</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Size</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Last modified</th>
                  <th className="px-6 py-2 text-right font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {largeFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3 font-medium text-foreground">{file.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{file.size}</td>
                    <td className="px-4 py-3 text-muted-foreground">{file.lastModified}</td>
                    <td className="px-6 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => removeLarge(file.id)}
                      >
                        <MoveRight className="h-3.5 w-3.5" />
                        {file.action}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Potential Duplicates */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Potential Duplicates</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {dupes.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No duplicates found.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {dupes.map((pair) => (
                <li key={pair.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground truncate">{pair.fileA.name}</span>
                        <Badge variant="secondary" className="shrink-0 text-xs">{pair.fileA.size}</Badge>
                        <span className="text-muted-foreground text-xs shrink-0">{pair.fileA.date}</span>
                      </div>
                      <div className="flex items-center gap-1.5 my-1 text-xs text-muted-foreground">
                        <Copy className="h-3 w-3" />
                        <span>duplicate</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground truncate">{pair.fileB.name}</span>
                        <Badge variant="secondary" className="shrink-0 text-xs">{pair.fileB.size}</Badge>
                        <span className="text-muted-foreground text-xs shrink-0">{pair.fileB.date}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeDupe(pair.id)}
                      className="shrink-0"
                    >
                      {pair.suggestedLabel}
                    </Button>
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
        </CardHeader>
        <CardContent className="p-0">
          {staleFiles.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No stale files found.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-2 text-left font-medium text-muted-foreground">File</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Last modified</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Days unchanged</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Size</th>
                  <th className="px-6 py-2 text-right font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staleFiles.map((file) => (
                  <tr
                    key={file.id}
                    className={`hover:bg-muted/30 transition-all ${
                      archivedIds.has(file.id) ? 'opacity-40' : 'opacity-100'
                    }`}
                  >
                    <td className="px-6 py-3 font-medium text-foreground">{file.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{file.lastModified}</td>
                    <td className="px-4 py-3 text-muted-foreground">{file.daysUnchanged}d</td>
                    <td className="px-4 py-3 text-muted-foreground">{file.size}</td>
                    <td className="px-6 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={archivedIds.has(file.id)}
                        onClick={() => archiveStale(file.id)}
                      >
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
