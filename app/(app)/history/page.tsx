'use client'

import { useEffect, useState } from 'react'
import {
  FolderOpen, Info, ChevronDown, ChevronUp,
  ShieldCheck, Trash2, RotateCcw, Search, Loader2, ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  apiGetBatches, apiGetBatchOps, apiUndoBatch,
  apiGetArchive, apiRestoreFile, apiUndoSingleOp, apiDeleteArchivedFile,
} from '@/lib/api'
import type { ApiBatch, ApiFileOp, ApiArchivedFile } from '@/lib/api'
import { timeAgo } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortFolder(path: string): string {
  if (!path) return '(unknown)'
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 2) return path
  return '.../' + parts.slice(-2).join('/')
}

function fileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path
}

function stateLabel(batch: ApiBatch, undoResult?: { reversed: number; skipped: number }): string {
  const n = batch.op_count
  const files = `${n} ${n === 1 ? 'file' : 'files'}`
  if (undoResult) {
    const { reversed, skipped } = undoResult
    return `${files} moved · ${reversed} restored${skipped ? ` · ${skipped} skipped` : ''}`
  }
  if (batch.status === 'undone') return `${files} moved · all restored`
  if (batch.status === 'partial') return `${files} moved · partially restored`
  return `${files} moved`
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'applied')
    return <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-100">Applied</Badge>
  if (status === 'undone')
    return <Badge className="bg-muted text-muted-foreground border-0 hover:bg-muted">Undone</Badge>
  return <Badge className="bg-yellow-100 text-yellow-700 border-0 hover:bg-yellow-100">Partial</Badge>
}

// ─── BatchRow ─────────────────────────────────────────────────────────────────

function BatchRow({
  batch,
  onStatusChange,
}: {
  batch: ApiBatch
  onStatusChange: (id: string, status: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [ops, setOps] = useState<ApiFileOp[] | null>(null)
  const [opsLoading, setOpsLoading] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [undoingOpId, setUndoingOpId] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState(batch.status)
  const [undoResult, setUndoResult] = useState<{ reversed: number; skipped: number } | undefined>()

  async function loadOps() {
    if (ops !== null) return
    setOpsLoading(true)
    try {
      setOps(await apiGetBatchOps(batch.id))
    } catch {
      setOps([])
    } finally {
      setOpsLoading(false)
    }
  }

  function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next) loadOps()
  }

  async function handleUndo() {
    setUndoing(true)
    try {
      const result = await apiUndoBatch(batch.id)
      setLocalStatus(result.status)
      setUndoResult({ reversed: result.reversed, skipped: result.skipped })
      onStatusChange(batch.id, result.status)
    } catch (e) {
      console.error('Undo failed', e)
    } finally {
      setUndoing(false)
    }
  }

  async function handleOpUndo(opId: string) {
    setUndoingOpId(opId)
    try {
      await apiUndoSingleOp(opId)
      setOps(prev => prev ? prev.filter(op => op.id !== opId) : prev)
    } catch (e) {
      console.error('Single-op undo failed', e)
    } finally {
      setUndoingOpId(null)
    }
  }

  const reversible = localStatus !== 'undone'

  return (
    <Card className="bg-card shadow-sm overflow-hidden">
      <CardContent className="flex items-center gap-4 p-4">
        {/* Expand toggle — plain div so it doesn't nest buttons */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleToggle()}
          className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer select-none"
          aria-expanded={expanded}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <FolderOpen className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {batch.label || shortFolder(batch.folder_path)}
            </p>
            <p className="text-xs text-muted-foreground">
              {shortFolder(batch.folder_path)} · {timeAgo(new Date(batch.created_at).getTime())} · {stateLabel({ ...batch, status: localStatus }, undoResult)}
            </p>
          </div>
          <span className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <StatusBadge status={localStatus} />
          <AlertDialog>
            {/* Use render prop (base-ui pattern) to avoid nested <button> */}
            <AlertDialogTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!reversible || undoing}
                />
              }
            >
              {undoing
                ? <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                : <RotateCcw className="size-3.5 mr-1.5" />}
              {reversible ? `Undo ${batch.op_count} ${batch.op_count === 1 ? 'file' : 'files'}` : 'Undone'}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Undo this batch?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will move {batch.op_count} {batch.op_count === 1 ? 'file' : 'files'} back to their original locations. Files already restored will be skipped automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleUndo}>Confirm Undo</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>

      {expanded && (
        <div className="border-t border-border bg-muted/20 px-5 py-3">
          {opsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : ops && ops.length > 0 ? (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                File operations
              </p>
              <ul className="flex flex-col gap-2">
                {ops.map(op => (
                  <li key={op.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="font-medium text-foreground truncate max-w-[180px] tabular-nums"
                      title={op.from_location}
                    >
                      {fileName(op.from_location)}
                    </span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                    <span
                      className="text-muted-foreground truncate flex-1"
                      title={op.to_location}
                    >
                      {op.to_location}
                    </span>
                    {op.op_type !== 'undo' && !op.skipped && (
                      <button
                        onClick={() => handleOpUndo(op.id)}
                        disabled={undoingOpId === op.id}
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
                      >
                        {undoingOpId === op.id ? '...' : 'Undo'}
                      </button>
                    )}
                    {op.skipped && (
                      <span className="shrink-0 text-[10px] text-muted-foreground/50">skipped</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-2 text-xs text-muted-foreground">No operations recorded.</p>
          )}
        </div>
      )}
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [batches, setBatches] = useState<ApiBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [batchesError, setBatchesError] = useState<string | null>(null)

  const [archive, setArchive] = useState<ApiArchivedFile[]>([])
  const [archiveLoading, setArchiveLoading] = useState(true)

  const [query, setQuery] = useState('')
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    apiGetBatches()
      .then(setBatches)
      .catch(e => setBatchesError(e.message))
      .finally(() => setBatchesLoading(false))

    apiGetArchive()
      .then(setArchive)
      .catch(() => {})
      .finally(() => setArchiveLoading(false))
  }, [])

  function handleStatusChange(id: string, status: string) {
    setBatches(prev => prev.map(b => b.id === id ? { ...b, status } : b))
  }

  async function handleRestore(opId: string) {
    setRestoringIds(prev => new Set([...prev, opId]))
    try {
      await apiRestoreFile(opId)
      setTimeout(() => {
        setArchive(prev => prev.filter(f => f.op_id !== opId))
        setRestoringIds(prev => { const n = new Set(prev); n.delete(opId); return n })
      }, 600)
    } catch (e) {
      console.error('Restore failed', e)
      setRestoringIds(prev => { const n = new Set(prev); n.delete(opId); return n })
    }
  }

  async function handleDelete(opId: string) {
    try {
      await apiDeleteArchivedFile(opId)
    } catch (e) {
      console.error('Delete failed', e)
    }
    setArchive(prev => prev.filter(f => f.op_id !== opId))
  }

  const appliedCount = batches.filter(b => b.status === 'applied').length

  const filteredArchive = query.trim()
    ? archive.filter(f =>
        f.file_name.toLowerCase().includes(query.toLowerCase()) ||
        f.original_path.toLowerCase().includes(query.toLowerCase()),
      )
    : archive

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Undo past batches or restore archived files.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
        <Info className="h-4 w-4 shrink-0 text-primary" />
        <span>
          Batches are kept for <strong className="text-foreground">30 days</strong>. Undoing a batch is a forward operation — files already restored are skipped automatically.
        </span>
      </div>

      <Tabs defaultValue="batches">
        <TabsList className="w-full justify-start gap-1">
          <TabsTrigger value="batches">
            Batches
            {appliedCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{appliedCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="archive">
            Archive
            {archive.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{archive.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Batches tab */}
        <TabsContent value="batches" className="mt-4">
          {batchesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : batchesError ? (
            <p className="py-4 text-sm text-destructive">{batchesError}</p>
          ) : batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <FolderOpen className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No batches yet. Organize a folder to create your first batch.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {batches.map(batch => (
                <BatchRow key={batch.id} batch={batch} onStatusChange={handleStatusChange} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Archive tab */}
        <TabsContent value="archive" className="mt-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Mini Manager <strong className="text-foreground">never deletes</strong> files automatically. Files here can always be restored.
              </span>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search archived files..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Card className="bg-card border border-border rounded-lg shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Archived Files</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {filteredArchive.length} {filteredArchive.length === 1 ? 'file' : 'files'}
                  {query && ` matching "${query}"`}
                </p>
              </CardHeader>
              <div className="p-0">
                {archiveLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredArchive.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <ShieldCheck className="h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {query ? 'No files match your search.' : 'Archive is empty.'}
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredArchive.map(file => {
                      const restoring = restoringIds.has(file.op_id)
                      return (
                        <li
                          key={file.op_id}
                          className={`flex items-start gap-4 px-6 py-4 transition-all ${restoring ? 'opacity-40' : 'opacity-100'}`}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{file.file_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate" title={file.original_path}>
                              From: {file.original_path}
                            </p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5 truncate" title={file.archive_path}>
                              In: {file.archive_path}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {timeAgo(new Date(file.archived_at).getTime())}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={restoring}
                              onClick={() => handleRestore(file.op_id)}
                              className="gap-1.5"
                            >
                              <RotateCcw className="size-3.5" />
                              Restore
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    <strong>{file.file_name}</strong> will be deleted forever. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(file.op_id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete permanently
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
