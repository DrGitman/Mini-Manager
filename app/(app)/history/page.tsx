'use client'

import { useState } from 'react'
import { FolderOpen, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// ---------------------------------------------------------------------------
// Types & demo data
// ---------------------------------------------------------------------------

type BatchStatus = 'Applied' | 'Undone' | 'Partial'

interface DemoBatch {
  id: string
  name: string
  folder: string
  date: string
  opCount: number
  status: BatchStatus
}

const DEMO_BATCHES: DemoBatch[] = [
  { id: 'b1', name: 'Downloads scan',              folder: '~/Downloads',           date: 'Aug 5, 2026',  opCount: 14, status: 'Applied' },
  { id: 'b2', name: 'Documents scan',              folder: '~/Documents',           date: 'Aug 3, 2026',  opCount: 6,  status: 'Applied' },
  { id: 'b3', name: 'Desktop scan',                folder: '~/Desktop',             date: 'Aug 2, 2026',  opCount: 9,  status: 'Undone'  },
  { id: 'b4', name: 'Downloads scan',              folder: '~/Downloads',           date: 'Jul 30, 2026', opCount: 22, status: 'Applied' },
  { id: 'b5', name: 'Documents + Downloads scan',  folder: '~/Documents, ~/Downloads', date: 'Jul 25, 2026', opCount: 31, status: 'Partial' },
  { id: 'b6', name: 'Desktop scan',                folder: '~/Desktop',             date: 'Jul 20, 2026', opCount: 5,  status: 'Applied' },
  { id: 'b7', name: 'Downloads scan',              folder: '~/Downloads',           date: 'Jul 15, 2026', opCount: 18, status: 'Applied' },
  { id: 'b8', name: 'Old archive cleanup',         folder: '~/Downloads/Archive',   date: 'Jul 10, 2026', opCount: 44, status: 'Applied' },
]

// Five sample file-move operations shown per batch when expanded
const SAMPLE_OPS = [
  { from: 'invoice_march.pdf',          to: 'Documents/Finance/' },
  { from: 'IMG_4821.heic',             to: 'Images/' },
  { from: 'resume_v7_FINAL_final.docx', to: 'Documents/Job Search/' },
  { from: 'Screenshot 2025-07-14.png',  to: 'Images/Screenshots/' },
  { from: 'meeting-recording.mp3',      to: 'Audio/Meetings/' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: BatchStatus) {
  if (status === 'Applied')
    return <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-100">Applied</Badge>
  if (status === 'Undone')
    return <Badge className="bg-gray-100 text-gray-500 border-0 hover:bg-gray-100">Undone</Badge>
  return <Badge className="bg-yellow-100 text-yellow-700 border-0 hover:bg-yellow-100">Partial</Badge>
}

// ---------------------------------------------------------------------------
// Batch row
// ---------------------------------------------------------------------------

function BatchRow({
  batch,
  onUndo,
}: {
  batch: DemoBatch
  onUndo: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="bg-card shadow-sm overflow-hidden">
      {/* Main row */}
      <CardContent className="flex items-center gap-4 p-4">
        {/* Expand toggle + icon */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
          aria-label={expanded ? 'Collapse batch' : 'Expand batch'}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <FolderOpen className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{batch.name}</p>
            <p className="text-xs text-muted-foreground">
              {batch.folder} · {batch.date} · {batch.opCount} files
            </p>
          </div>
          <span className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {/* Status + Undo */}
        <div className="flex shrink-0 items-center gap-3">
          {statusBadge(batch.status)}
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button size="sm" variant="outline" disabled={batch.status === 'Undone'} />}
            >
              Undo
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Undo this batch?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will move {batch.opCount} files back to their original locations. This action cannot be re-applied automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onUndo(batch.id)}>
                  Confirm Undo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>

      {/* Expanded operations */}
      {expanded && (
        <div className="border-t border-border bg-background px-5 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sample operations
          </p>
          <ul className="flex flex-col gap-1.5">
            {SAMPLE_OPS.map((op, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{op.from}</span>
                <span>→</span>
                <span>{op.to}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HistoryPage() {
  const [batches, setBatches] = useState<DemoBatch[]>(DEMO_BATCHES)

  function handleUndo(id: string) {
    setBatches((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: 'Undone' } : b)),
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Undo a past batch to restore files to their original locations.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
        <Info className="h-4 w-4 shrink-0 text-primary" />
        <span>
          Batches are kept for <strong className="text-foreground">30 days</strong>. Undo is always available within that window.
        </span>
      </div>

      {/* Batch list */}
      <div className="flex flex-col gap-3">
        {batches.map((batch) => (
          <BatchRow key={batch.id} batch={batch} onUndo={handleUndo} />
        ))}
      </div>
    </div>
  )
}
