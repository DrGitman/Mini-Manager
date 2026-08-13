'use client'

import {
  useState, useRef, useEffect, useCallback,
  KeyboardEvent, type ReactNode,
} from 'react'
import {
  Sparkles, X, SendHorizonal, Mic, MicOff, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Plus, Clock, Trash2,
  Copy, ThumbsUp, RotateCcw, Pencil,
} from 'lucide-react'
import { BouncingDots } from '@/components/ui/bouncing-dots'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/types'
import { apiAgent, apiGetPreferences } from '@/lib/api'
import type { AgentStep, AgentQuestion } from '@/lib/api'
import { getSession } from '@/lib/session'

const eAPI = typeof window !== 'undefined' ? (window as any).electronAPI : undefined
const isElectron = !!eAPI?.isElectron

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type MsgStatus = 'working' | 'complete' | 'failed'

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  text: string
  ts: number
  status?: MsgStatus
  steps?: AgentStep[]
}

interface Session {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
}

interface PaletteState {
  questions: AgentQuestion[]
  page: number
  cursor: number
  answers: { question: string; selected: string[] }[]
}

const SESSIONS_KEY = 'mm.agent.sessions'

function loadSessions(): Session[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]') } catch { return [] }
}
function saveSessions(sessions: Session[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 20)))
}
function sessionTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user')
  if (!first) return 'New chat'
  return first.text.length > 45 ? first.text.slice(0, 45) + '…' : first.text
}

// ─── Path-aware text renderer ─────────────────────────────────────────────────

const PATH_SPLIT = /((?:[A-Za-z]:\\|\/(?=[^\s/]))[^\s]+)/g
function isPathToken(s: string) {
  return /^[A-Za-z]:\\/.test(s) || /^\/[^\s]/.test(s)
}
function MessageBody({ text, inBubble = false }: { text: string; inBubble?: boolean }) {
  const parts = text.split(PATH_SPLIT)
  return (
    <>
      {parts.map((part, i) =>
        isPathToken(part) ? (
          <code key={i} className={cn('rounded px-1.5 py-0.5 font-mono text-[13px] break-all', inBubble ? 'bg-white/15' : 'bg-muted text-muted-foreground')}>
            {part}
          </code>
        ) : <span key={i}>{part}</span>
      )}
    </>
  )
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function AgentMark() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
      <Sparkles className="size-4" />
    </div>
  )
}

function StatusPill({ status }: { status: MsgStatus }) {
  if (status === 'working') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      Working
    </span>
  )
  if (status === 'complete') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/8 px-2 py-0.5 text-xs font-medium text-primary">
      <CheckCircle2 className="size-3" />
      Task complete
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
      Failed
    </span>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
      {children}
    </button>
  )
}

// ─── Step tracker ─────────────────────────────────────────────────────────────

type StepState = 'pending' | 'active' | 'done' | 'failed' | 'skipped'

interface AnimatedStep {
  id: string
  label: string
  detail?: string
  state: StepState
}

function StepIndicator({ state }: { state: StepState }) {
  const base = 'flex size-[18px] shrink-0 items-center justify-center rounded-full'
  if (state === 'done') return (
    <span className={cn(base, 'bg-primary text-white')}>
      <svg viewBox="0 0 16 16" className="size-2.5" fill="none" stroke="currentColor">
        <path d="M3.5 8.5l3 3 6-7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
  if (state === 'failed') return (
    <span className={cn(base, 'bg-rose-500 text-white')}>
      <svg viewBox="0 0 16 16" className="size-2.5" fill="none" stroke="currentColor">
        <path d="M4 4l8 8M12 4l-8 8" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  )
  if (state === 'active') return (
    <span className={base}>
      <svg viewBox="0 0 20 20" className="size-[18px] animate-spin text-primary">
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeDasharray="33" strokeDashoffset="24" />
      </svg>
    </span>
  )
  // pending / skipped
  return <span className={cn(base, 'border-[1.5px] border-border')} />
}

function StepTracker({ steps: rawSteps }: { steps: AgentStep[] }) {
  const [animated, setAnimated] = useState<AnimatedStep[]>([])
  const [open, setOpen] = useState(true)
  const collapsedOnce = useRef(false)

  // On mount / when steps change: animate through pending → active → final
  useEffect(() => {
    if (!rawSteps.length) return
    // Start all pending
    const initial: AnimatedStep[] = rawSteps.map((s, i) => ({
      id: String(i), label: s.label, detail: s.detail, state: 'pending',
    }))
    setAnimated(initial)
    setOpen(true)
    collapsedOnce.current = false

    // Stagger: activate each step 300ms apart, then settle 400ms later
    rawSteps.forEach((s, i) => {
      setTimeout(() => {
        setAnimated(prev => prev.map((a, j) => j === i ? { ...a, state: 'active' } : a))
        setTimeout(() => {
          const finalState: StepState =
            s.status === 'done' ? 'done'
            : s.status === 'failed' ? 'failed'
            : s.status === 'skipped' ? 'skipped'
            : 'done'
          setAnimated(prev => prev.map((a, j) => j === i ? { ...a, state: finalState } : a))
        }, 400)
      }, i * 350)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSteps.map(s => s.label).join('|')])

  // Auto-collapse once all settled
  const settled = animated.length > 0 && animated.every(s => s.state !== 'pending' && s.state !== 'active')
  useEffect(() => {
    if (settled && !collapsedOnce.current) {
      collapsedOnce.current = true
      const t = setTimeout(() => setOpen(false), 900)
      return () => clearTimeout(t)
    }
  }, [settled])

  const hasFailed = animated.some(s => s.state === 'failed')
  const activeStep = animated.find(s => s.state === 'active')
  const doneCount = animated.filter(s => s.state === 'done').length

  const summary = settled
    ? hasFailed ? `Stopped · ${doneCount} of ${animated.length} steps` : `Done · ${doneCount} step${doneCount === 1 ? '' : 's'}`
    : activeStep ? `${activeStep.label}…` : 'Working…'

  if (!animated.length) return null

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition hover:bg-accent focus:outline-none">
        {/* star mark */}
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-primary" fill="currentColor" aria-hidden>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
        </svg>
        <span className={cn('min-w-0 flex-1 truncate text-sm', settled ? 'text-muted-foreground' : 'font-medium text-foreground')}>
          {summary}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open ? '' : '-rotate-90')} />
      </button>

      {/* Animate to content height with grid-rows trick */}
      <div className={cn('grid transition-all duration-300 ease-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          <ol className="space-y-3 px-3.5 pb-3.5 pt-1">
            {animated.map(step => {
              const muted = step.state === 'pending' || step.state === 'skipped'
              return (
                <li key={step.id} className="flex gap-2.5">
                  <span className="mt-0.5"><StepIndicator state={step.state} /></span>
                  <div className="min-w-0">
                    <p className={cn('text-sm leading-snug',
                      muted ? 'text-muted-foreground/50'
                      : step.state === 'active' ? 'font-medium text-foreground'
                      : step.state === 'failed' ? 'text-rose-600'
                      : 'text-foreground')}>
                      {step.label}
                    </p>
                    {step.detail && (
                      <p className={cn('mt-0.5 text-[13px] leading-snug', muted ? 'text-muted-foreground/30' : 'text-muted-foreground')}>
                        {step.detail}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

// ─── Docked Question Palette ──────────────────────────────────────────────────

function QuestionPalette({ palette, onComplete, onDismiss, composerRef }: {
  palette: PaletteState
  onComplete: (answers: { question: string; selected: string[] }[]) => void
  onDismiss: () => void
  composerRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const [page, setPage] = useState(palette.page)
  const [cursor, setCursor] = useState(palette.cursor)
  const [answers, setAnswers] = useState(palette.answers)
  const [staged, setStaged] = useState<Set<string>>(new Set())
  const [closing, setClosing] = useState(false)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])

  const question = palette.questions[page]
  const multi = question?.type === 'multi_select'
  const rowCount = question ? question.options.length + 1 : 0

  useEffect(() => { setCursor(0); setStaged(new Set()) }, [page])

  const dismiss = useCallback(() => {
    setClosing(true)
    setTimeout(() => { onDismiss(); composerRef.current?.focus() }, 140)
  }, [onDismiss, composerRef])

  const commit = useCallback((selection: string[]) => {
    const next = [...answers, { question: question.question, selected: selection }]
    if (page + 1 < palette.questions.length) {
      setAnswers(next)
      setPage(page + 1)
    } else {
      setClosing(true)
      setTimeout(() => onComplete(next), 140)
    }
  }, [answers, page, question, palette.questions.length, onComplete])

  const choose = useCallback((option: string) => {
    if (!multi) { commit([option]); return }
    setStaged(prev => {
      const next = new Set(prev)
      next.has(option) ? next.delete(option) : next.add(option)
      return next
    })
  }, [multi, commit])

  // Keyboard — bound to window, only fires when textarea is empty
  useEffect(() => {
    if (!question) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      const ta = composerRef.current
      const typing = document.activeElement === ta && (ta?.value ?? '').length > 0
      if (typing && !['Escape', 'ArrowUp', 'ArrowDown'].includes(e.key)) return

      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => (c + 1) % rowCount) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => (c - 1 + rowCount) % rowCount) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        if (cursor === rowCount - 1) dismiss()
        else if (multi && staged.size > 0 && e.metaKey) commit([...staged])
        else choose(question.options[cursor])
      }
      else if (e.key === 'Escape') { e.preventDefault(); dismiss() }
      else if (e.key === 'ArrowLeft' && page > 0) setPage(page - 1)
      else {
        const n = Number(e.key)
        if (n >= 1 && n <= question.options.length) { e.preventDefault(); choose(question.options[n - 1]) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [question, cursor, rowCount, multi, staged, page, choose, commit, dismiss, composerRef])

  useEffect(() => { rowRefs.current[cursor]?.scrollIntoView({ block: 'nearest' }) }, [cursor])

  if (!question) return null

  return (
    <div className={cn(
      'mx-4 mb-2 overflow-hidden rounded-2xl',
      'bg-neutral-800 shadow-2xl ring-1 ring-white/10',
      'transition-all duration-150',
      closing ? 'translate-y-1 opacity-0' : 'translate-y-0 opacity-100',
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <h2 className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-neutral-100">
          {question.question}
        </h2>
        {palette.questions.length > 1 && (
          <div className="flex shrink-0 items-center gap-1 text-sm text-neutral-400">
            <button type="button" onClick={() => page > 0 && setPage(page - 1)} disabled={page === 0}
              className="rounded p-1 transition hover:text-neutral-200 disabled:opacity-30">
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular-nums text-xs">{page + 1} of {palette.questions.length}</span>
            <span className="p-1 opacity-30"><ChevronRight className="size-4" /></span>
          </div>
        )}
        <button type="button" onClick={dismiss} aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-neutral-400 transition hover:bg-white/5 hover:text-neutral-200">
          <X className="size-4" />
        </button>
      </div>

      {/* Options */}
      <ul className="px-2 pb-2" role="listbox">
        {question.options.map((opt, i) => {
          const active = cursor === i
          const picked = staged.has(opt)
          return (
            <li
              key={opt}
              ref={el => { rowRefs.current[i] = el }}
              role="option"
              aria-selected={picked}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(opt)}
              className={cn(
                'group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-75',
                active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
                i > 0 && !active ? 'border-t border-white/[0.06]' : 'border-t border-transparent',
              )}
            >
              <span className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] tabular-nums',
                active || picked ? 'bg-white/10 text-neutral-100' : 'text-neutral-500',
              )}>
                {multi && picked
                  ? <CheckCircle2 className="size-3.5" />
                  : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] text-neutral-200">{opt}</span>
              {active && <ChevronRight className="size-4 shrink-0 text-neutral-400" />}
            </li>
          )
        })}

        {/* Something else / skip */}
        <li
          ref={el => { rowRefs.current[question.options.length] = el }}
          role="option"
          aria-selected={false}
          onMouseEnter={() => setCursor(question.options.length)}
          onClick={dismiss}
          className={cn(
            'group mt-1 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5',
            'border-t border-white/[0.06] transition-colors duration-75',
            cursor === question.options.length ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-500">
            <Pencil className="size-3.5" />
          </span>
          <span className="flex-1 text-[15px] text-neutral-400">Something else</span>
          <span className="rounded-lg bg-white/10 px-3 py-1 text-[13px] font-medium text-neutral-100">Skip</span>
        </li>
      </ul>

      {/* Multi-select confirm */}
      {multi && staged.size > 0 && (
        <div className="border-t border-white/[0.06] px-4 py-2.5 text-right">
          <button type="button" onClick={() => commit([...staged])}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-[13px] font-medium text-neutral-100 transition hover:bg-white/15">
            Continue with {staged.size} selected
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Messages ─────────────────────────────────────────────────────────────────

function UserMessage({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex justify-end min-w-0">
      <div className="max-w-[75%] min-w-0 rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-[15px] font-normal leading-relaxed text-white break-words [overflow-wrap:anywhere]">
        <MessageBody text={msg.text} inBubble />
      </div>
    </div>
  )
}

function AssistantMessage({ msg, onRetry }: {
  msg: ChatMessage
  onRetry: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const isWorking = msg.status === 'working'

  async function copy() {
    await navigator.clipboard.writeText(msg.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex gap-3 min-w-0">
      <AgentMark />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-foreground shrink-0">Mini Manager</span>
          {msg.status && <StatusPill status={msg.status} />}
          <span className="ml-auto text-xs tabular-nums text-muted-foreground shrink-0">{timeAgo(msg.ts)}</span>
        </div>
        {msg.text && (
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-[1.65] text-foreground break-words [overflow-wrap:anywhere]">
            <MessageBody text={msg.text} />
          </p>
        )}
        {msg.steps && msg.steps.length > 0 && (
          <StepTracker steps={msg.steps} />
        )}
        {!isWorking && (
          <div className="mt-3 flex items-center gap-0.5">
            <IconBtn label={copied ? 'Copied' : 'Copy'} onClick={copy}><Copy className="size-4" /></IconBtn>
            <IconBtn label="Good response"><ThumbsUp className="size-4" /></IconBtn>
            <button type="button" onClick={() => onRetry(msg.id)}
              className="ml-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <RotateCcw className="size-3.5" />
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingMessage() {
  return (
    <div className="flex gap-3 min-w-0">
      <AgentMark />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Mini Manager</span>
          <StatusPill status="working" />
        </div>
        <div className="mt-2"><BouncingDots /></div>
      </div>
    </div>
  )
}

// ─── History panel ─────────────────────────────────────────────────────────────

function HistoryPanel({ sessions, activeId, onSelect, onNew, onDelete, onClose }: {
  sessions: Session[]; activeId: string
  onSelect: (s: Session) => void; onNew: () => void
  onDelete: (id: string) => void; onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Clock className="size-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-semibold text-foreground">Chat history</span>
        <button onClick={onClose} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors">
          <X className="size-4" />
        </button>
      </div>
      <div className="p-3">
        <button onClick={onNew} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors">
          <Plus className="size-4" /> New session
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">No previous sessions</p>
        ) : (
          <div className="flex flex-col gap-1">
            {sessions.map(s => (
              <div key={s.id} onClick={() => onSelect(s)}
                className={cn('group flex items-start gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors',
                  s.id === activeId ? 'bg-primary/8' : 'hover:bg-accent')}>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs font-medium truncate', s.id === activeId ? 'text-primary' : 'text-foreground')}>{s.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(s.createdAt)}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); onDelete(s.id) }}
                  className="shrink-0 size-6 flex items-center justify-center rounded-lg text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-50 transition-all">
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const SUGGESTIONS = [
  'Organise my Downloads by file type',
  "Rename all screenshots with today's date",
  'Find and group duplicate files',
  'Sort files alphabetically by name',
]

// ─── Scan scope helpers ───────────────────────────────────────────────────────

interface FileListing {
  folder: string
  files: { name: string; ext: string; size_kb: number; path: string }[]
}

async function buildFileListing(): Promise<FileListing[]> {
  if (!isElectron) return []
  try {
    const prefs = await apiGetPreferences()
    const session = getSession()
    const username = session?.name?.split(' ')[0] ?? 'User'

    // Build list of scope paths
    const scopePaths: string[] = []
    const platform = eAPI?.platform ?? 'win32'
    const home = platform === 'win32'
      ? `C:\\Users\\${username}`
      : `/Users/${username}`

    if (prefs.monitor_downloads) scopePaths.push(platform === 'win32' ? `${home}\\Downloads` : `${home}/Downloads`)
    if (prefs.monitor_desktop) scopePaths.push(platform === 'win32' ? `${home}\\Desktop` : `${home}/Desktop`)
    if (prefs.monitor_documents) scopePaths.push(platform === 'win32' ? `${home}\\Documents` : `${home}/Documents`)
    for (const f of prefs.custom_folders ?? []) {
      if (f) scopePaths.push(f)
    }

    if (scopePaths.length === 0) return []

    // Scan each folder
    const listings: FileListing[] = []
    for (const folderPath of scopePaths) {
      try {
        const { files } = await eAPI.scanDirectory(folderPath)
        const folderName = folderPath.split(/[\\/]/).pop() ?? folderPath
        listings.push({
          folder: `${folderName} (${folderPath})`,
          files: files.slice(0, 300).map((f: any) => ({
            name: f.name,
            ext: f.extension,
            size_kb: Math.round((f.sizeBytes ?? 0) / 1024),
            path: f.absolutePath ?? f.relativePath ?? f.name,
          })),
        })
      } catch {
        // folder doesn't exist or no access — skip silently
      }
    }
    return listings
  } catch {
    return []
  }
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AiPanel({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions())
  const [activeId, setActiveId] = useState<string>(() => {
    const existing = loadSessions()
    return existing.length > 0 ? existing[0].id : `s-${Date.now()}`
  })
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const existing = loadSessions()
    return existing.length > 0 ? existing[0].messages : []
  })
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [palette, setPalette] = useState<PaletteState | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef('')
  const scopeListingRef = useRef<FileListing[]>([])

  // Autosize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    setVoiceSupported(!!SR)
  }, [])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [messages, thinking])

  useEffect(() => {
    if (messages.length === 0) return
    setSessions(prev => {
      const title = sessionTitle(messages)
      const existing = prev.find(s => s.id === activeId)
      const updated = existing
        ? prev.map(s => s.id === activeId ? { ...s, messages, title } : s)
        : [{ id: activeId, title, messages, createdAt: Date.now() }, ...prev]
      saveSessions(updated)
      return updated
    })
  }, [messages, activeId])

  function newSession() {
    const id = `s-${Date.now()}`
    setActiveId(id)
    setMessages([])
    setPalette(null)
    setShowHistory(false)
  }

  function selectSession(s: Session) {
    setActiveId(s.id)
    setMessages(s.messages)
    setPalette(null)
    setShowHistory(false)
  }

  function deleteSession(id: string) {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id)
      saveSessions(updated)
      if (id === activeId) {
        if (updated.length > 0) { setActiveId(updated[0].id); setMessages(updated[0].messages) }
        else { setActiveId(`s-${Date.now()}`); setMessages([]) }
      }
      return updated
    })
  }

  function startListening() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognitionRef.current = recognition
    recognition.onstart = () => { setListening(true); transcriptRef.current = '' }
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('')
      transcriptRef.current = t
      setInput(t)
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
      const t = transcriptRef.current.trim()
      if (t) { transcriptRef.current = ''; setInput(''); sendMessage(t) }
    }
    recognition.onerror = () => { setListening(false); recognitionRef.current = null }
    recognition.start()
  }

  function stopListening() { recognitionRef.current?.stop(); setListening(false) }

  async function sendMessage(text?: string) {
    const txt = (text ?? input).trim()
    if (!txt || thinking) return
    if (listening) stopListening()
    setPalette(null)

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: txt, ts: Date.now() }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setThinking(true)

    try {
      // Refresh file listing on every send so agent always has current file state
      const fileListing = await buildFileListing()
      scopeListingRef.current = fileListing

      const apiHistory = history.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }))
      const res = await apiAgent(apiHistory, undefined, fileListing.length > 0 ? fileListing : undefined)
      const hasTask = (res.steps ?? []).length > 0
      const questions = res.questions ?? []

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`, role: 'ai', text: res.reply, ts: Date.now(),
        status: hasTask ? 'complete' : undefined,
        steps: res.steps ?? [],
      }])

      // If clarification needed, open the docked palette
      if (res.needs_clarification && questions.length > 0 && questions.some(q => (q.options ?? []).length > 0)) {
        setPalette({ questions, page: 0, cursor: 0, answers: [] })
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `ai-err-${Date.now()}`, role: 'ai',
        text: 'Something went wrong. Please try again.',
        ts: Date.now(), status: 'failed',
      }])
    } finally {
      setThinking(false)
    }
  }

  function handlePaletteComplete(answers: { question: string; selected: string[] }[]) {
    setPalette(null)
    const msg = answers.map(a => `${a.question} → ${a.selected.join(', ')}`).join('\n')
    sendMessage(msg)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function handleRetry(aiId: string) {
    const idx = messages.findIndex(m => m.id === aiId)
    if (idx < 1) return
    const lastUser = [...messages].slice(0, idx).reverse().find(m => m.role === 'user')
    if (!lastUser) return
    setMessages(prev => prev.slice(0, idx))
    sendMessage(lastUser.text)
  }

  const isEmpty = messages.length === 0

  return (
    <aside className="relative flex h-full w-[34rem] flex-col bg-background border-l border-border shadow-xl overflow-hidden font-sans antialiased">

      {showHistory && (
        <HistoryPanel sessions={sessions} activeId={activeId} onSelect={selectSession} onNew={newSession} onDelete={deleteSession} onClose={() => setShowHistory(false)} />
      )}

      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <AgentMark />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Mini Manager AI</h2>
          <p className="text-xs text-muted-foreground">File organisation assistant{palette ? ` · ${palette.questions.length} open question${palette.questions.length > 1 ? 's' : ''}` : ''}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setShowHistory(v => !v)} title="History" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors">
            <Clock className="size-4" />
          </button>
          <button onClick={newSession} title="New chat" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors">
            <Plus className="size-4" />
          </button>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors">
            <X className="size-4" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="flex min-h-full min-w-0 flex-col justify-end gap-8 px-5 py-8">

          {isEmpty && (
            <div className="flex flex-col items-center text-center gap-5 pt-8">
              <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="size-7 text-primary" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">How can I help?</p>
                <p className="text-sm text-muted-foreground mt-1">Ask me to organise, rename, or sort your files.</p>
              </div>
              <div className="flex flex-col gap-2 w-full text-left">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => sendMessage(s)}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-[14px] text-muted-foreground text-left hover:border-primary/40 hover:text-primary transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg =>
            msg.role === 'user'
              ? <UserMessage key={msg.id} msg={msg} />
              : <AssistantMessage key={msg.id} msg={msg} onRetry={handleRetry} />
          )}

          {thinking && <ThinkingMessage />}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Docked question palette — above composer */}
      {palette && (
        <QuestionPalette
          palette={palette}
          composerRef={textareaRef}
          onComplete={handlePaletteComplete}
          onDismiss={() => { setPalette(null); textareaRef.current?.focus() }}
        />
      )}

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-background/80 px-4 py-4 backdrop-blur">
        <div className={cn(
          'flex items-end gap-2 rounded-2xl bg-muted/40 p-2 ring-1 transition-all',
          listening ? 'ring-red-300 ring-2' : 'ring-border focus-within:ring-2 focus-within:ring-primary/40'
        )}>
          {listening && (
            <div className="flex items-center gap-1.5 px-2 py-1 self-center">
              <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-500 font-medium">Listening…</span>
            </div>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={palette ? 'Or reply directly…' : 'Ask anything, or describe a task…'}
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center gap-1 shrink-0">
            {voiceSupported && (
              <button onClick={() => listening ? stopListening() : startListening()}
                className={cn('flex size-9 items-center justify-center rounded-xl transition-colors',
                  listening ? 'bg-red-500 text-white' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </button>
            )}
            <button onClick={() => sendMessage()} disabled={!input.trim() || thinking}
              className="flex size-9 items-center justify-center rounded-xl bg-primary text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground hover:bg-primary/90 transition-all">
              <SendHorizonal className="size-4" />
            </button>
          </div>
        </div>
        {palette ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> navigate · <kbd className="font-sans">Enter</kbd> select · number keys jump
          </p>
        ) : (
          <p className="mt-2 text-center text-xs text-muted-foreground">Enter to send · Shift+Enter for new line</p>
        )}
      </div>
    </aside>
  )
}
