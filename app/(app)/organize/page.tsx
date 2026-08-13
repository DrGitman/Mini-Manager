'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { FolderOpen, FolderSearch, ArrowRight, CheckSquare, ArrowUpDown, FolderSymlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SuccessCheck } from '@/components/ui/success-check'
import { useToast } from '@/components/ui/toast'
import { FixedBar } from '@/components/ui/fixed-bar'
import type { FileMeta, Proposal, ConfidenceBucket } from '@/lib/types'
import { cn } from '@/lib/utils'
import { apiClassify, apiSaveScan, apiGetPreferences } from '@/lib/api'
import type { ClassificationResult, FolderSuggestion } from '@/lib/api'
import { getSession } from '@/lib/session'

// Extensions we can read as text in the browser (non-Electron path)
const TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.log', '.yaml', '.yml',
  '.xml', '.html', '.htm', '.js', '.ts', '.jsx', '.tsx', '.py', '.css',
  '.ini', '.cfg', '.conf', '.toml', '.env', '.sh', '.bat', '.sql',
])

// Detect Electron runtime
const eAPI = typeof window !== 'undefined' ? (window as any).electronAPI : undefined
const isElectron = !!eAPI?.isElectron

function confidenceColor(c: number) {
  if (c >= 0.85) return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800/50'
  if (c >= 0.7)  return 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800/50'
  return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/50'
}

function sourceBadge(source: Proposal['source']) {
  if (source === 'ai')   return <Badge className="bg-indigo-50 text-indigo-600 border-indigo-200 border text-[10px] h-4 px-1.5 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/50">AI</Badge>
  if (source === 'rule') return <Badge className="bg-purple-50 text-purple-600 border-purple-200 border text-[10px] h-4 px-1.5 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/50">Rule</Badge>
  return <Badge className="bg-muted text-muted-foreground border text-[10px] h-4 px-1.5">Auto</Badge>
}

function extBadge(ext: string) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-muted text-muted-foreground uppercase">
      {ext.replace('.', '') || '?'}
    </span>
  )
}

// ─── File Table ───────────────────────────────────────────────────────────────

interface FileTableProps {
  proposals: Proposal[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[]) => void
  folderName: string
}

function FileTable({ proposals, selected, onToggle, onToggleAll, folderName }: FileTableProps) {
  const ids = proposals.map(p => p.id)
  const allChecked = ids.length > 0 && ids.every(id => selected.has(id))

  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <CheckSquare className="mb-3 size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No files in this category</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-10 px-3 py-3 text-left">
                <Checkbox checked={allChecked} onCheckedChange={() => onToggleAll(ids)} />
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">File</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Current</th>
              <th className="w-6 px-1" />
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Proposed name</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Target folder</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">Confidence</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">Reason</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">Source</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map(p => (
              <tr
                key={p.id}
                className={cn(
                  'border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30',
                  selected.has(p.id) && 'bg-primary/5',
                )}
              >
                <td className="px-3 py-2.5">
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => onToggle(p.id)} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {extBadge(p.file.extension)}
                    <span className="truncate max-w-[150px] text-muted-foreground text-xs" title={p.file.name}>{p.file.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[100px] truncate" title={p.file.relativePath}>{p.file.relativePath || `${folderName}/`}</td>
                <td className="px-1 text-muted-foreground/40"><ArrowRight className="size-3.5 shrink-0" /></td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-xs font-semibold text-foreground truncate max-w-[150px] block" title={p.newName}>{p.newName}</span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[120px]">{p.targetFolder}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums', confidenceColor(p.confidence))}>
                    {p.confidence.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-help truncate max-w-[90px] block text-xs text-muted-foreground underline decoration-dotted mx-auto" />}>
                      {p.reason.slice(0, 20)}…
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">{p.reason}</TooltipContent>
                  </Tooltip>
                </td>
                <td className="px-3 py-2.5 text-center">{sourceBadge(p.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  )
}

// ─── Folder Table ─────────────────────────────────────────────────────────────

interface FolderTableProps {
  suggestions: FolderSuggestion[]
  selected: Set<string>
  onToggle: (path: string) => void
  onToggleAll: (paths: string[]) => void
  folderName: string
}

function FolderTable({ suggestions, selected, onToggle, onToggleAll, folderName }: FolderTableProps) {
  const paths = suggestions.map(s => s.original_path)
  const allChecked = paths.length > 0 && paths.every(p => selected.has(p))

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <FolderSymlink className="mb-3 size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">All folder names look good</p>
        <p className="mt-1 text-xs text-muted-foreground/60">No renames suggested</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-10 px-3 py-3 text-left">
                <Checkbox checked={allChecked} onCheckedChange={() => onToggleAll(paths)} />
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Current folder</th>
              <th className="w-6 px-1" />
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Suggested name</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">Confidence</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">Reason</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map(s => (
              <tr
                key={s.original_path}
                className={cn(
                  'border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30',
                  selected.has(s.original_path) && 'bg-primary/5',
                )}
              >
                <td className="px-3 py-2.5">
                  <Checkbox checked={selected.has(s.original_path)} onCheckedChange={() => onToggle(s.original_path)} />
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px] block" title={s.original_path}>
                    {s.original_path === folderName ? <span className="text-amber-600">(root) </span> : null}{s.original_path}
                  </span>
                </td>
                <td className="px-1 text-muted-foreground/40"><ArrowRight className="size-3.5 shrink-0" /></td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-xs font-semibold text-foreground">{s.suggested_name}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums', confidenceColor(s.confidence))}>
                    {s.confidence.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-help truncate max-w-[120px] block text-xs text-muted-foreground underline decoration-dotted mx-auto" />}>
                      {s.reason.slice(0, 24)}…
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">{s.reason}</TooltipContent>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ScanState = 'idle' | 'scanning' | 'done'
type SortKey = 'name' | 'confidence' | 'category' | 'size'
type SortDir = 'asc' | 'desc'

interface FolderHandleEntry {
  handle: FileSystemDirectoryHandle
  parent: FileSystemDirectoryHandle
}

export default function OrganizePage() {
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanProgress, setScanProgress] = useState(0)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [folderSuggestions, setFolderSuggestions] = useState<FolderSuggestion[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set())
  const [applyState, setApplyState] = useState<'idle' | 'loading' | 'success'>('idle')
  const [applyProgress, setApplyProgress] = useState(0)
  const [folderName, setFolderName] = useState('folder')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Browser (FSAA) refs
  const fileMapRef = useRef<Map<string, FileMeta>>(new Map())
  const fileHandlesRef = useRef<Map<string, FileSystemFileHandle>>(new Map())
  const parentDirMapRef = useRef<Map<string, FileSystemDirectoryHandle>>(new Map())
  const folderHandleMapRef = useRef<Map<string, FolderHandleEntry>>(new Map())
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null)
  const existingFoldersRef = useRef<string[]>([])

  // Electron refs — absolute paths for native file ops
  const rootDirPathRef = useRef<string>('')
  const absolutePathMapRef = useRef<Map<string, string>>(new Map())

  const { toast, ToastContainer } = useToast()
  const searchParams = useSearchParams()
  const [quickFolders, setQuickFolders] = useState<string[]>([])

  const sortedProposals = useMemo(() => {
    return [...proposals].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name')            cmp = a.file.name.localeCompare(b.file.name)
      else if (sortKey === 'confidence') cmp = a.confidence - b.confidence
      else if (sortKey === 'category')   cmp = a.category.localeCompare(b.category)
      else if (sortKey === 'size')       cmp = a.file.sizeBytes - b.file.sizeBytes
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [proposals, sortKey, sortDir])

  const byBucket = useMemo(() => ({
    auto:   sortedProposals.filter(p => p.bucket === 'auto'),
    review: sortedProposals.filter(p => p.bucket === 'review'),
    input:  sortedProposals.filter(p => p.bucket === 'input'),
  }), [sortedProposals])

  // ── Scan (Electron) ─────────────────────────────────────────────────────────

  const scanElectron = useCallback(async (prefillPath?: string) => {
    const dirPath: string | null = prefillPath ?? await eAPI.openDirectoryPicker()
    if (!dirPath) return

    const name = dirPath.split(/[\\/]/).pop() ?? 'folder'
    setFolderName(name)
    rootDirPathRef.current = dirPath
    setScanState('scanning')
    setScanProgress(10)

    const { files, folders } = await eAPI.scanDirectory(dirPath)

    if (files.length === 0) {
      setScanState('idle')
      toast('No files found in that folder.')
      return
    }

    const absMap = new Map<string, string>()
    files.forEach((f: any) => absMap.set(f.id, f.absolutePath))
    absolutePathMapRef.current = absMap
    existingFoldersRef.current = folders

    // Fake progress ticks while API runs
    setScanProgress(30)
    const steps = [45, 60, 75, 85]
    let si = 0
    const tick = () => { if (si < steps.length) { setScanProgress(steps[si++]); setTimeout(tick, 200) } }
    setTimeout(tick, 100)

    try {
      const fileMetas: FileMeta[] = files.map((f: any) => ({
        id: f.id, name: f.name, extension: f.extension,
        relativePath: f.relativePath, sizeBytes: f.sizeBytes, modifiedAt: f.modifiedAt,
      }))
      fileMapRef.current = new Map(fileMetas.map(f => [f.id, f]))

      const res = await apiClassify(
        files.map((f: any) => ({
          id: f.id, name: f.name, extension: f.extension,
          size: f.sizeBytes, modified_at: f.modifiedAt,
          relative_path: f.relativePath,
          content_preview: f.contentPreview ?? '',
        })),
        folders,
        name,
      )
      setScanProgress(100)
      finishScan(res)
    } catch {
      setScanState('idle')
      setScanProgress(0)
      toast('Failed to classify files. Please try again.')
    }
  }, [toast])

  // ── Load quick-access folders + auto-scan from ?path= (Electron only) ────────

  useEffect(() => {
    if (!isElectron) return

    // Auto-scan if navigated here with ?path=
    const path = searchParams.get('path')
    if (path) { scanElectron(path); return }

    // Build quick-folder list from preferences + session username
    const session = getSession()
    const username = session?.name ?? 'User'

    apiGetPreferences().then(prefs => {
      const folders: string[] = []
      if (prefs.monitor_downloads) folders.push(`C:\\Users\\${username}\\Downloads`)
      if (prefs.monitor_desktop)   folders.push(`C:\\Users\\${username}\\Desktop`)
      if (prefs.monitor_documents) folders.push(`C:\\Users\\${username}\\Documents`)
      prefs.custom_folders.forEach(f => { if (!folders.includes(f)) folders.push(f) })
      setQuickFolders(folders)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scan (Browser FSAA) ─────────────────────────────────────────────────────

  async function scanBrowser() {
    if (!('showDirectoryPicker' in window)) {
      toast('Your browser doesn\'t support folder picking. Please use Chrome or Edge.')
      return
    }

    let dirHandle: FileSystemDirectoryHandle
    try {
      dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    } catch {
      return
    }

    setFolderName(dirHandle.name)
    dirHandleRef.current = dirHandle
    setScanState('scanning')
    setScanProgress(10)

    const realFiles: (FileMeta & { contentPreview?: string })[] = []
    const handleMap = new Map<string, FileSystemFileHandle>()
    const parentDirMap = new Map<string, FileSystemDirectoryHandle>()
    const folderHandleMap = new Map<string, FolderHandleEntry>()
    const existingFolders: string[] = []

    async function walkDir(dir: FileSystemDirectoryHandle, relPath: string): Promise<void> {
      for await (const [name, handle] of (dir as any).entries()) {
        if (realFiles.length >= 500) break
        if ((handle as FileSystemHandle).kind === 'directory') {
          const subPath = relPath ? `${relPath}/${name}` : name
          existingFolders.push(subPath)
          folderHandleMap.set(subPath, { handle: handle as FileSystemDirectoryHandle, parent: dir })
          await walkDir(handle as FileSystemDirectoryHandle, subPath)
        } else if ((handle as FileSystemHandle).kind === 'file') {
          const file = await (handle as FileSystemFileHandle).getFile()
          const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : ''
          const id = crypto.randomUUID()
          const filePath = relPath ? `${relPath}/${name}` : name

          let contentPreview: string | undefined
          if (TEXT_EXTS.has(ext) && file.size < 500_000) {
            try { contentPreview = (await file.text()).slice(0, 400).trim() } catch {}
          }

          realFiles.push({ id, name, extension: ext, relativePath: filePath, sizeBytes: file.size, modifiedAt: file.lastModified, contentPreview })
          handleMap.set(id, handle as FileSystemFileHandle)
          parentDirMap.set(id, dir)
        }
      }
    }

    try {
      await walkDir(dirHandle, '')
    } catch {
      setScanState('idle')
      toast('Could not read folder contents.')
      return
    }

    if (realFiles.length === 0) {
      setScanState('idle')
      toast('No files found in that folder.')
      return
    }

    fileMapRef.current = new Map(realFiles.map(f => [f.id, f]))
    fileHandlesRef.current = handleMap
    parentDirMapRef.current = parentDirMap
    folderHandleMapRef.current = folderHandleMap
    existingFoldersRef.current = existingFolders
    setScanProgress(30)

    const steps = [45, 60, 75, 85]
    let i = 0
    const tick = () => { if (i < steps.length) { setScanProgress(steps[i++]); setTimeout(tick, 200) } }
    setTimeout(tick, 100)

    try {
      const res = await apiClassify(
        realFiles.map(f => ({
          id: f.id, name: f.name, extension: f.extension,
          size: f.sizeBytes, modified_at: f.modifiedAt,
          relative_path: f.relativePath,
          content_preview: f.contentPreview ?? '',
        })),
        existingFolders,
        dirHandle.name,
      )
      setScanProgress(100)
      finishScan(res)
    } catch {
      setScanState('idle')
      setScanProgress(0)
      toast('Failed to classify files. Please try again.')
    }
  }

  function finishScan(res: Awaited<ReturnType<typeof apiClassify>>) {
    const all: Proposal[] = res.results.map((r: ClassificationResult) => {
      const file = fileMapRef.current.get(r.id) ?? { id: r.id, name: r.id, extension: '', relativePath: '', sizeBytes: 0, modifiedAt: Date.now() }
      const bucket: ConfidenceBucket = r.confidence >= 0.85 ? 'auto' : r.confidence >= 0.7 ? 'review' : 'input'
      return { id: `p-${r.id}`, file, targetFolder: r.target_folder, newName: r.new_name, category: r.category, reason: r.reason, confidence: r.confidence, bucket, selected: false, source: r.source }
    })
    setProposals(all)
    setFolderSuggestions(res.folder_suggestions ?? [])
    setSelected(new Set(all.filter(p => p.bucket === 'auto').map(p => p.id)))
    setSelectedFolders(new Set())
    setScanState('done')
  }

  async function handleScan() {
    if (isElectron) await scanElectron()
    else await scanBrowser()
  }


  // ── Apply file changes (Electron) ────────────────────────────────────────────

  async function applyElectron(toApply: Proposal[]) {
    const succeeded: Proposal[] = []
    const failed: string[] = []

    for (let i = 0; i < toApply.length; i++) {
      const p = toApply[i]
      const absFrom = absolutePathMapRef.current.get(p.file.id)
      if (!absFrom) { failed.push(p.file.name); continue }

      // Build absolute target path: rootDir / targetFolder / newName
      const rootDir = rootDirPathRef.current
      const sep = eAPI.platform === 'win32' ? '\\' : '/'
      const targetParts = p.targetFolder.replace(/\//g, sep).split(sep).filter(Boolean)
      const targetDir = [rootDir, ...targetParts].join(sep)
      const absTo = `${targetDir}${sep}${p.newName}`

      try {
        await eAPI.moveFile(absFrom, absTo)
        // Update our map so subsequent renames in the same batch stay consistent
        absolutePathMapRef.current.set(p.file.id, absTo)
        succeeded.push(p)
      } catch (err) {
        console.error('Failed to move', p.file.name, err)
        failed.push(p.file.name)
      }
      setApplyProgress(Math.round(((i + 1) / toApply.length) * 100))
    }
    return { succeeded, failed }
  }

  // ── Apply file changes (Browser FSAA) ───────────────────────────────────────

  async function applyBrowser(toApply: Proposal[]) {
    const succeeded: Proposal[] = []
    const failed: string[] = []

    for (let i = 0; i < toApply.length; i++) {
      const proposal = toApply[i]
      try {
        const fileHandle = fileHandlesRef.current.get(proposal.file.id)
        if (!fileHandle) throw new Error('No handle')
        const file = await fileHandle.getFile()
        const buffer = await file.arrayBuffer()
        const parts = proposal.targetFolder.split('/').filter(Boolean)
        let targetDir: FileSystemDirectoryHandle = dirHandleRef.current!
        for (const part of parts) targetDir = await targetDir.getDirectoryHandle(part, { create: true })
        const newHandle = await targetDir.getFileHandle(proposal.newName, { create: true })
        const writable = await (newHandle as any).createWritable()
        await writable.write(buffer)
        await writable.close()
        const parentDir = parentDirMapRef.current.get(proposal.file.id) ?? dirHandleRef.current!
        await parentDir.removeEntry(proposal.file.name)
        succeeded.push(proposal)
      } catch (err) {
        console.error('Failed to move', proposal.file.name, err)
        failed.push(proposal.file.name)
      }
      setApplyProgress(Math.round(((i + 1) / toApply.length) * 100))
    }
    return { succeeded, failed }
  }

  async function handleApply() {
    if (applyState !== 'idle' || selected.size === 0) return
    if (!isElectron && !dirHandleRef.current) { toast('No folder open. Please scan again.'); return }

    setApplyState('loading')
    setApplyProgress(0)

    const toApply = proposals.filter(p => selected.has(p.id))
    const { succeeded, failed } = isElectron
      ? await applyElectron(toApply)
      : await applyBrowser(toApply)

    setApplyState('success')
    if (failed.length === 0) toast(`${succeeded.length} file${succeeded.length !== 1 ? 's' : ''} organised successfully`)
    else toast(`${succeeded.length} organised, ${failed.length} failed`, 'error')

    apiSaveScan(folderName, succeeded.length, succeeded.map(p => ({
      id: p.id, name: p.file.name, new_name: p.newName,
      target_folder: p.targetFolder, category: p.category,
      confidence: p.confidence, size: p.file.sizeBytes,
      extension: p.file.extension, modified_at: p.file.modifiedAt,
    }))).catch(() => {})

    await new Promise(r => setTimeout(r, 2500))
    const succeededIds = new Set(succeeded.map(p => p.id))
    setProposals(prev => prev.filter(p => !succeededIds.has(p.id)))
    setSelected(new Set())
    setApplyState('idle')
    setApplyProgress(0)
  }

  // ── Apply folder renames ─────────────────────────────────────────────────────

  async function applyFolderRenames() {
    if (applyState !== 'idle' || selectedFolders.size === 0) return

    setApplyState('loading')
    setApplyProgress(0)

    const toRename = folderSuggestions.filter(s => selectedFolders.has(s.original_path))
    // Deepest first — rename children before parents
    toRename.sort((a, b) => b.original_path.split('/').length - a.original_path.split('/').length)

    const succeeded: string[] = []
    const failed: string[] = []

    if (isElectron) {
      // Simple fs.rename — instant on same volume
      const rootDir = rootDirPathRef.current
      const sep = eAPI.platform === 'win32' ? '\\' : '/'

      for (let i = 0; i < toRename.length; i++) {
        const s = toRename[i]
        const oldAbs = [rootDir, ...s.original_path.split('/').filter(Boolean)].join(sep)
        const newAbs = [rootDir, ...s.suggested_path.split('/').filter(Boolean)].join(sep)

        try {
          await eAPI.renameFolder(oldAbs, newAbs)
          succeeded.push(s.original_path)
        } catch (err) {
          console.error('Failed to rename folder', s.original_path, err)
          failed.push(s.original_path)
        }
        setApplyProgress(Math.round(((i + 1) / toRename.length) * 100))
      }
    } else {
      // Browser: recursive copy-then-delete
      async function recursiveCopy(src: FileSystemDirectoryHandle, dst: FileSystemDirectoryHandle): Promise<void> {
        for await (const [name, handle] of (src as any).entries()) {
          if ((handle as FileSystemHandle).kind === 'directory') {
            const newDir = await dst.getDirectoryHandle(name, { create: true })
            await recursiveCopy(handle as FileSystemDirectoryHandle, newDir)
          } else {
            const file = await (handle as FileSystemFileHandle).getFile()
            const buf = await file.arrayBuffer()
            const newFile = await dst.getFileHandle(name, { create: true })
            const w = await (newFile as any).createWritable()
            await w.write(buf); await w.close()
          }
        }
      }

      for (let i = 0; i < toRename.length; i++) {
        const s = toRename[i]
        if (s.original_path === folderName) {
          toast('Root folder cannot be renamed via browser API — rename it manually.', 'error')
          failed.push(s.original_path)
          continue
        }
        const entry = folderHandleMapRef.current.get(s.original_path)
        if (!entry) { failed.push(s.original_path); continue }

        try {
          const { handle, parent } = entry
          const newDir = await parent.getDirectoryHandle(s.suggested_name, { create: true })
          await recursiveCopy(handle, newDir)
          await parent.removeEntry(s.original_path.split('/').pop()!, { recursive: true } as any)
          succeeded.push(s.original_path)
        } catch (err) {
          console.error('Failed to rename folder', s.original_path, err)
          failed.push(s.original_path)
        }
        setApplyProgress(Math.round(((i + 1) / toRename.length) * 100))
      }
    }

    setApplyState('success')
    if (failed.length === 0) {
      toast(`${succeeded.length} folder${succeeded.length !== 1 ? 's' : ''} renamed successfully`)
    } else {
      toast(`${succeeded.length} renamed, ${failed.length} failed`, 'error')
    }

    await new Promise(r => setTimeout(r, 2500))
    const succeededSet = new Set(succeeded)
    setFolderSuggestions(prev => prev.filter(s => !succeededSet.has(s.original_path)))
    setSelectedFolders(new Set())
    setApplyState('idle')
    setApplyProgress(0)
  }

  function toggleOne(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleMany(ids: string[]) {
    setSelected(prev => {
      const next = new Set(prev)
      if (ids.every(id => next.has(id))) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }
  function toggleFolder(path: string) {
    setSelectedFolders(prev => { const next = new Set(prev); next.has(path) ? next.delete(path) : next.add(path); return next })
  }
  function toggleManyFolders(paths: string[]) {
    setSelectedFolders(prev => {
      const next = new Set(prev)
      if (paths.every(p => next.has(p))) paths.forEach(p => next.delete(p))
      else paths.forEach(p => next.add(p))
      return next
    })
  }

  const selectedCount = selected.size
  const selectedFolderCount = selectedFolders.size

  return (
    <div className="flex flex-col gap-5">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {scanState === 'idle' && 'Pick a folder to scan'}
          {scanState === 'scanning' && 'Scanning your folder…'}
          {scanState === 'done' && `${proposals.length} file proposals · ${folderSuggestions.length} folder suggestion${folderSuggestions.length !== 1 ? 's' : ''}`}
        </p>
        <div className="flex items-center gap-2">
          {scanState === 'done' && (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1">
              <ArrowUpDown className="size-3 text-muted-foreground" />
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="text-xs text-foreground bg-transparent outline-none cursor-pointer"
              >
                <option value="name">Name</option>
                <option value="confidence">Confidence</option>
                <option value="category">Category</option>
                <option value="size">Size</option>
              </select>
              <button
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                className="text-xs text-muted-foreground hover:text-foreground font-medium w-6"
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          )}
          <Button
            onClick={handleScan}
            disabled={scanState === 'scanning'}
            variant={scanState === 'done' ? 'outline' : 'default'}
            size="sm"
            className="gap-2"
          >
            <FolderOpen className="size-4" />
            {scanState === 'scanning' ? 'Scanning…' : scanState === 'done' ? 'Re-scan' : 'Scan Folder'}
          </Button>
        </div>
      </div>

      {/* Idle */}
      {scanState === 'idle' && (
        <div className="flex flex-col gap-4">
          {/* Quick folders (Electron only, when preferences have folders saved) */}
          {isElectron && quickFolders.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick scan</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {quickFolders.map(folder => {
                  const label = folder.split(/[\\/]/).pop() ?? folder
                  return (
                    <button
                      key={folder}
                      onClick={() => scanElectron(folder)}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent hover:border-primary/30 group"
                    >
                      <FolderOpen className="size-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{label}</p>
                        <p className="text-xs text-muted-foreground truncate">{folder}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
            <FolderSearch className="mb-4 size-10 text-muted-foreground/40 animate-float" />
            <h3 className="text-sm font-medium text-foreground">
              {isElectron && quickFolders.length > 0 ? 'Or pick any folder' : 'No folder scanned yet'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isElectron ? 'Click Scan Folder to browse for any folder' : 'Click Scan Folder to get started'}
            </p>
          </div>
        </div>
      )}

      {/* Scanning */}
      {scanState === 'scanning' && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Scanning {folderName}…</span>
            <span className="text-muted-foreground">{scanProgress}%</span>
          </div>
          <Progress value={scanProgress} className="h-1.5" />
          <p className="mt-2 text-xs text-muted-foreground">Reading files, content previews, and folder structure…</p>
        </div>
      )}

      {/* Results */}
      {scanState === 'done' && (
        <Tabs defaultValue="auto">
          <TabsList className="h-9 bg-muted/60">
            <TabsTrigger value="auto" className="gap-1.5 text-xs">
              Auto-apply
              <span className="rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-green-950/50 dark:text-green-400">{byBucket.auto.length}</span>
            </TabsTrigger>
            <TabsTrigger value="review" className="gap-1.5 text-xs">
              Review
              <span className="rounded-full bg-yellow-100 text-yellow-700 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-yellow-950/50 dark:text-yellow-400">{byBucket.review.length}</span>
            </TabsTrigger>
            <TabsTrigger value="input" className="gap-1.5 text-xs">
              Needs input
              <span className="rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-red-950/50 dark:text-red-400">{byBucket.input.length}</span>
            </TabsTrigger>
            <TabsTrigger value="folders" className="gap-1.5 text-xs">
              Folders
              {folderSuggestions.length > 0 && (
                <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-amber-950/50 dark:text-amber-400">{folderSuggestions.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auto" className="mt-4">
            <FileTable proposals={byBucket.auto} selected={selected} onToggle={toggleOne} onToggleAll={toggleMany} folderName={folderName} />
          </TabsContent>
          <TabsContent value="review" className="mt-4">
            <FileTable proposals={byBucket.review} selected={selected} onToggle={toggleOne} onToggleAll={toggleMany} folderName={folderName} />
          </TabsContent>
          <TabsContent value="input" className="mt-4">
            <FileTable proposals={byBucket.input} selected={selected} onToggle={toggleOne} onToggleAll={toggleMany} folderName={folderName} />
          </TabsContent>
          <TabsContent value="folders" className="mt-4">
            <FolderTable suggestions={folderSuggestions} selected={selectedFolders} onToggle={toggleFolder} onToggleAll={toggleManyFolders} folderName={folderName} />
          </TabsContent>
        </Tabs>
      )}

      {/* Fixed bottom bar */}
      {scanState === 'done' && (selectedCount > 0 || selectedFolderCount > 0 || applyState !== 'idle') && (
        <FixedBar>
          <div className="fixed bottom-0 left-56 right-0 z-50 flex items-center gap-3 border-t border-border bg-card/95 px-8 py-3 backdrop-blur-sm">
            <span className="text-sm text-muted-foreground">
              {selectedCount > 0 && `${selectedCount} file${selectedCount !== 1 ? 's' : ''}`}
              {selectedCount > 0 && selectedFolderCount > 0 && ' · '}
              {selectedFolderCount > 0 && `${selectedFolderCount} folder${selectedFolderCount !== 1 ? 's' : ''}`}
              {' selected'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setSelected(new Set()); setSelectedFolders(new Set()) }}>Clear</Button>
              {selectedFolderCount > 0 && (
                <button
                  onClick={applyFolderRenames}
                  disabled={applyState !== 'idle'}
                  className="relative h-9 min-w-[160px] overflow-hidden rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40"
                >
                  {applyState === 'idle' && `Rename ${selectedFolderCount} folder${selectedFolderCount !== 1 ? 's' : ''}`}
                  {applyState === 'loading' && <span className="text-muted-foreground text-xs">{applyProgress}%</span>}
                  {applyState === 'success' && <span className="flex items-center justify-center"><SuccessCheck size={22} /></span>}
                </button>
              )}
              {selectedCount > 0 && (
                <button
                  onClick={handleApply}
                  disabled={applyState !== 'idle'}
                  className="btn-glow relative h-9 min-w-[150px] overflow-hidden rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {applyState === 'idle' && `Apply ${selectedCount} changes`}
                  {applyState === 'loading' && (
                    <span className="flex items-center justify-center gap-2">
                      <span className="text-white/80 text-xs">{applyProgress}%</span>
                      <span className="btn-progress-bar" style={{ width: `${applyProgress}%` }} />
                    </span>
                  )}
                  {applyState === 'success' && (
                    <span className="flex items-center justify-center"><SuccessCheck size={22} /></span>
                  )}
                </button>
              )}
            </div>
          </div>
        </FixedBar>
      )}

      <ToastContainer />
    </div>
  )
}
