'use client'

import { useState } from 'react'
import { ShieldCheck, Trash2, RotateCcw, FolderOpen, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface QuarantinedFile {
  id: string
  originalPath: string
  name: string
  size: string
  quarantinedAt: string
  reason: string
  category: 'low-confidence' | 'duplicate' | 'stale' | 'rule'
}

const INITIAL_FILES: QuarantinedFile[] = [
  { id: 'q1', originalPath: '~/Downloads/IMG_4821-copy.HEIC',          name: 'IMG_4821-copy.HEIC',          size: '2.9 MB',  quarantinedAt: 'Aug 5, 2026',  reason: 'Detected as duplicate of IMG_4821.HEIC',                 category: 'duplicate'      },
  { id: 'q2', originalPath: '~/Desktop/resume_v7_FINAL_final.docx',    name: 'resume_v7_FINAL_final.docx',  size: '44 KB',   quarantinedAt: 'Aug 5, 2026',  reason: 'Low AI confidence — kept for manual review',             category: 'low-confidence' },
  { id: 'q3', originalPath: '~/Downloads/old-backup.zip',              name: 'old-backup.zip',              size: '800 MB',  quarantinedAt: 'Aug 3, 2026',  reason: 'Unchanged for 300+ days, flagged by stale-file rule',    category: 'stale'          },
  { id: 'q4', originalPath: '~/Documents/invoice_march_final (2).pdf', name: 'invoice_march_final (2).pdf', size: '245 KB',  quarantinedAt: 'Aug 3, 2026',  reason: 'Duplicate of invoice_march_final.pdf',                   category: 'duplicate'      },
  { id: 'q5', originalPath: '~/Desktop/Screenshot 2024-11-02.png',     name: 'Screenshot 2024-11-02.png',   size: '1.1 MB',  quarantinedAt: 'Jul 30, 2026', reason: 'Matched rule: "Move old screenshots older than 90 days"', category: 'rule'           },
  { id: 'q6', originalPath: '~/Downloads/temp_data_export.csv',        name: 'temp_data_export.csv',        size: '3.2 MB',  quarantinedAt: 'Jul 25, 2026', reason: 'Matched rule: "Quarantine unnamed temp files"',          category: 'rule'           },
]

const CAT: Record<QuarantinedFile['category'], { label: string; cls: string }> = {
  'low-confidence': { label: 'Low confidence', cls: 'bg-amber-100 text-amber-700 border-0 hover:bg-amber-100'   },
  'duplicate':      { label: 'Duplicate',      cls: 'bg-blue-100 text-blue-700 border-0 hover:bg-blue-100'      },
  'stale':          { label: 'Stale',           cls: 'bg-orange-100 text-orange-700 border-0 hover:bg-orange-100'},
  'rule':           { label: 'Rule match',      cls: 'bg-purple-100 text-purple-700 border-0 hover:bg-purple-100'},
}

export default function QuarantinePage() {
  const [files, setFiles] = useState<QuarantinedFile[]>(INITIAL_FILES)
  const [query, setQuery] = useState('')
  const [restoredIds, setRestoredIds] = useState<Set<string>>(new Set())

  function handleRestore(id: string) {
    setRestoredIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      setFiles(prev => prev.filter(f => f.id !== id))
      setRestoredIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }, 700)
  }

  function handleDelete(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const filtered = query.trim()
    ? files.filter(f =>
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.reason.toLowerCase().includes(query.toLowerCase())
      )
    : files

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Archive</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Files moved here instead of deleted. Restore or permanently remove them.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-foreground">{files.length}</p>
          <p className="text-xs text-muted-foreground">files quarantined</p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
        <span>
          Mini Manager <strong className="text-foreground">never deletes</strong> files automatically. Anything moved here can be restored. Files are kept for <strong className="text-foreground">30 days</strong> before permanent removal.
        </span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search quarantined files…" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
      </div>

      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Archived Files</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} {filtered.length === 1 ? 'file' : 'files'}{query && ` matching "${query}"`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <ShieldCheck className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {query ? 'No files match your search.' : 'Quarantine is empty.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map(file => {
                const cfg = CAT[file.category]
                const restoring = restoredIds.has(file.id)
                return (
                  <li key={file.id} className={`flex items-start gap-4 px-6 py-4 transition-all ${restoring ? 'opacity-40' : 'opacity-100'}`}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                        <Badge className={`shrink-0 text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{file.originalPath}</p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{file.reason}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{file.size} · {file.quarantinedAt}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="sm" variant="outline" disabled={restoring} onClick={() => handleRestore(file.id)} className="gap-1.5">
                        <RotateCcw className="size-3.5" />
                        Restore
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
                            <AlertDialogDescription>
                              <strong>{file.name}</strong> will be deleted forever. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(file.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete permanently</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
