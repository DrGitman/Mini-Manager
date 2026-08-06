'use client'

import { useState } from 'react'
import { Shield, Trash2, RotateCcw, Recycle, FileText, FileImage, FileArchive, File } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
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
import { Separator } from '@/components/ui/separator'

// ---------------------------------------------------------------------------
// Types & demo data
// ---------------------------------------------------------------------------

interface QuarantinedFile {
  id: string
  name: string
  size: string
  date: string
  group: string
}

const INITIAL_FILES: QuarantinedFile[] = [
  { id: 'q1', name: 'duplicate_invoice.pdf',       size: '245 KB',  date: 'Aug 5',  group: '2026-08-05' },
  { id: 'q2', name: 'IMG_duplicate.jpg',            size: '3.4 MB',  date: 'Aug 5',  group: '2026-08-05' },
  { id: 'q3', name: 'old-backup-copy.zip',          size: '820 MB',  date: 'Aug 3',  group: '2026-08-03' },
  { id: 'q4', name: 'screenshot_old.png',           size: '890 KB',  date: 'Aug 3',  group: '2026-08-03' },
  { id: 'q5', name: 'untitled document (1).docx',  size: '15 KB',   date: 'Aug 3',  group: '2026-08-03' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext ?? '')) return FileText
  if (['jpg', 'jpeg', 'png', 'heic', 'gif', 'webp'].includes(ext ?? '')) return FileImage
  if (['zip', 'rar', '7z', 'tar'].includes(ext ?? '')) return FileArchive
  return File
}

function groupLabel(group: string) {
  if (group === '2026-08-05') return 'August 5, 2026'
  if (group === '2026-08-03') return 'August 3, 2026'
  return group
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuarantinePage() {
  const [files, setFiles]         = useState<QuarantinedFile[]>(INITIAL_FILES)
  const [toastMsg, setToastMsg]   = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2500)
  }

  function handleRestore(id: string) {
    const file = files.find((f) => f.id === id)
    setRestoringId(id)
    setTimeout(() => {
      setFiles((prev) => prev.filter((f) => f.id !== id))
      setRestoringId(null)
      showToast(`"${file?.name}" restored successfully.`)
    }, 600)
  }

  function handleDeletePermanently(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const groups = [...new Set(files.map((f) => f.group))]

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Quarantine</h1>
        <p className="text-muted-foreground mt-1">
          Files here are safe. Nothing is ever permanently deleted. Restore anytime.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-muted rounded-lg p-3">
        <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-muted-foreground">
          Quarantine is at{' '}
          <span className="font-mono text-foreground">C:\Users\[name]\MiniManager\Quarantine</span>.
          Files are automatically removed after 30 days unless restored.
        </p>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          {toastMsg}
        </div>
      )}

      {/* Files card */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Quarantined Files</CardTitle>
          <CardDescription>
            {files.length} file{files.length !== 1 ? 's' : ''} in quarantine
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {files.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Recycle className="h-10 w-10" />
              <p className="text-sm font-medium">Quarantine is empty — everything&apos;s been restored or cleared.</p>
            </div>
          ) : (
            groups.map((group, gi) => (
              <div key={group}>
                {gi > 0 && <Separator />}
                {/* Group header */}
                <div className="px-6 py-2 bg-muted/40">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {groupLabel(group)}
                    <span className="ml-2 font-normal normal-case">
                      ({files.filter((f) => f.group === group).length} files)
                    </span>
                  </p>
                </div>
                <ul className="divide-y divide-border">
                  {files
                    .filter((f) => f.group === group)
                    .map((file) => {
                      const Icon = fileIcon(file.name)
                      const isRestoring = restoringId === file.id
                      return (
                        <li
                          key={file.id}
                          className={`flex items-center gap-4 px-6 py-3 transition-all ${
                            isRestoring ? 'opacity-40' : 'opacity-100'
                          }`}
                        >
                          {/* Icon */}
                          <Icon className="h-5 w-5 text-muted-foreground shrink-0" />

                          {/* Name + meta */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {file.size} · Quarantined {file.date}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isRestoring}
                              onClick={() => handleRestore(file.id)}
                              className="gap-1.5"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restore
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium text-destructive transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete permanently
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    <span className="font-medium text-foreground">{file.name}</span> will be
                                    permanently deleted. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeletePermanently(file.id)}
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
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Auto-cleanup notice */}
      <p className="text-xs text-muted-foreground text-center">
        Files older than 30 days are automatically removed. Next cleanup: Aug 25, 2026.
      </p>
    </div>
  )
}
