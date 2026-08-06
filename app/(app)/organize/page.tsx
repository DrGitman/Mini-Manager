'use client'

import { useState, useMemo } from 'react'
import { FolderOpen, FolderSearch, ArrowRight, CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SuccessCheck } from '@/components/ui/success-check'
import { useToast } from '@/components/ui/toast'
import { FixedBar } from '@/components/ui/fixed-bar'
import { DEMO_LIBRARY } from '@/lib/demo-data'
import { runHeuristics } from '@/lib/heuristics'
import { DEFAULT_PREFERENCES } from '@/lib/types'
import type { Proposal, ConfidenceBucket } from '@/lib/types'
import { cn } from '@/lib/utils'

function confidenceColor(c: number) {
  if (c >= 0.85) return 'bg-green-50 text-green-700 border-green-200'
  if (c >= 0.7)  return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

function sourceBadge(source: Proposal['source']) {
  if (source === 'ai')   return <Badge className="bg-indigo-50 text-indigo-600 border-indigo-200 border text-[10px] h-4 px-1.5">AI</Badge>
  if (source === 'rule') return <Badge className="bg-purple-50 text-purple-600 border-purple-200 border text-[10px] h-4 px-1.5">Rule</Badge>
  return <Badge className="bg-gray-100 text-gray-500 border text-[10px] h-4 px-1.5">Auto</Badge>
}

function extBadge(ext: string) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-gray-100 text-gray-500 uppercase">
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
}

function FileTable({ proposals, selected, onToggle, onToggleAll }: FileTableProps) {
  const ids = proposals.map(p => p.id)
  const allChecked = ids.length > 0 && ids.every(id => selected.has(id))

  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <CheckSquare className="mb-3 size-8 text-gray-300" />
        <p className="text-sm text-gray-400">No files in this category</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="w-10 px-3 py-3 text-left">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={checked => checked ? onToggleAll(ids) : onToggleAll([])}
                />
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400">File</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400">Current</th>
              <th className="w-6 px-1" />
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400">Proposed name</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400">Target folder</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-400">Confidence</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-400">Reason</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-400">Source</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map(p => (
              <tr
                key={p.id}
                className={cn(
                  'border-b border-gray-50 last:border-0 transition-colors hover:bg-gray-50',
                  selected.has(p.id) && 'bg-primary/4',
                )}
              >
                <td className="px-3 py-2.5">
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => onToggle(p.id)} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {extBadge(p.file.extension)}
                    <span className="truncate max-w-[150px] text-gray-600 text-xs" title={p.file.name}>{p.file.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-400 max-w-[100px] truncate">Downloads/</td>
                <td className="px-1 text-gray-300"><ArrowRight className="size-3.5 shrink-0" /></td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-xs font-semibold text-gray-800 truncate max-w-[150px] block" title={p.newName}>{p.newName}</span>
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-400 truncate max-w-[120px]">{p.targetFolder}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums', confidenceColor(p.confidence))}>
                    {p.confidence.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-help truncate max-w-[90px] block text-xs text-gray-400 underline decoration-dotted mx-auto" />}>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

type ScanState = 'idle' | 'scanning' | 'done'

export default function OrganizePage() {
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanProgress, setScanProgress] = useState(0)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applyState, setApplyState] = useState<'idle' | 'loading' | 'success'>('idle')
  const [applyProgress, setApplyProgress] = useState(0)
  const { toast, ToastContainer } = useToast()

  const byBucket = useMemo(() => ({
    auto:   proposals.filter(p => p.bucket === 'auto'),
    review: proposals.filter(p => p.bucket === 'review'),
    input:  proposals.filter(p => p.bucket === 'input'),
  }), [proposals])

  function handleScan() {
    setScanState('scanning')
    setScanProgress(0)
    const steps = [10, 25, 45, 65, 80, 92, 100]
    let i = 0
    const tick = () => {
      if (i < steps.length) {
        setScanProgress(steps[i++])
        setTimeout(tick, 120)
      } else {
        const { proposals: hProps, ambiguous } = runHeuristics(DEMO_LIBRARY, [], DEFAULT_PREFERENCES)
        const fallbacks: Proposal[] = ambiguous.map(f => ({
          id: `p-${f.id}`, file: f, targetFolder: 'Documents', newName: f.name,
          category: 'Unknown', reason: 'Extension not recognised — please review before moving.',
          confidence: 0.55, bucket: 'input' as ConfidenceBucket, selected: false, source: 'heuristic' as const,
        }))
        const all = [...hProps, ...fallbacks]
        setProposals(all)
        setSelected(new Set(all.filter(p => p.bucket === 'auto').map(p => p.id)))
        setScanState('done')
      }
    }
    setTimeout(tick, 80)
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleMany(ids: string[]) {
    setSelected(prev => {
      const next = new Set(prev)
      if (ids.every(id => next.has(id))) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  async function handleApply() {
    if (applyState !== 'idle' || selected.size === 0) return
    const count = selected.size
    setApplyState('loading')
    setApplyProgress(0)
    for (let i = 0; i <= 100; i += 4) {
      await new Promise(r => setTimeout(r, 60))
      setApplyProgress(i)
    }
    setProposals(prev => prev.filter(p => !selected.has(p.id)))
    setSelected(new Set())
    setApplyState('success')
    toast(`${count} file${count !== 1 ? 's' : ''} organised successfully`)
    await new Promise(r => setTimeout(r, 2500))
    setApplyState('idle')
    setApplyProgress(0)
  }

  const selectedCount = selected.size

  return (
    <div className="flex flex-col gap-5">

      {/* Top action bar — only scan button when idle/scanning, apply when done */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {scanState === 'idle' && 'Select a folder to get started'}
          {scanState === 'scanning' && 'Scanning your folder…'}
          {scanState === 'done' && `${proposals.length} proposals found`}
        </p>
        <div className="flex items-center gap-2">
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-24 text-center">
          <FolderSearch className="mb-4 size-10 text-gray-300 animate-float" />
          <h3 className="text-sm font-medium text-gray-600">No folder scanned yet</h3>
          <p className="mt-1 text-xs text-gray-400">Click Scan Folder to get started</p>
        </div>
      )}

      {/* Scanning */}
      {scanState === 'scanning' && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Scanning Downloads…</span>
            <span className="text-gray-400">{scanProgress}%</span>
          </div>
          <Progress value={scanProgress} className="h-1.5" />
          <p className="mt-2 text-xs text-gray-400">Analysing file names, types, and metadata…</p>
        </div>
      )}

      {/* Results */}
      {scanState === 'done' && (
        <Tabs defaultValue="auto">
          <TabsList className="h-9 bg-gray-100/60">
            <TabsTrigger value="auto" className="gap-1.5 text-xs">
              Auto-apply
              <span className="rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-[10px] font-semibold">{byBucket.auto.length}</span>
            </TabsTrigger>
            <TabsTrigger value="review" className="gap-1.5 text-xs">
              Review
              <span className="rounded-full bg-yellow-100 text-yellow-700 px-1.5 py-0.5 text-[10px] font-semibold">{byBucket.review.length}</span>
            </TabsTrigger>
            <TabsTrigger value="input" className="gap-1.5 text-xs">
              Needs input
              <span className="rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-semibold">{byBucket.input.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auto" className="mt-4">
            <FileTable proposals={byBucket.auto} selected={selected} onToggle={toggleOne} onToggleAll={toggleMany} />
          </TabsContent>
          <TabsContent value="review" className="mt-4">
            <FileTable proposals={byBucket.review} selected={selected} onToggle={toggleOne} onToggleAll={toggleMany} />
          </TabsContent>
          <TabsContent value="input" className="mt-4">
            <FileTable proposals={byBucket.input} selected={selected} onToggle={toggleOne} onToggleAll={toggleMany} />
          </TabsContent>
        </Tabs>
      )}

      {/* Fixed bottom bar — only when files are selected */}
      {scanState === 'done' && selectedCount > 0 && (
        <FixedBar>
        <div className="fixed bottom-0 left-56 right-0 z-50 flex items-center gap-3 border-t border-gray-100 bg-white/95 px-8 py-3 backdrop-blur-sm">
          <span className="text-sm text-gray-500">
            {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
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
          </div>
        </div>
        </FixedBar>
      )}

      <ToastContainer />
    </div>
  )
}
