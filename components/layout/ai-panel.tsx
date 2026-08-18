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
import { apiAgent, runAgentOperations, type AgentOperation } from '@/lib/api'
import {
  type AgentContext, buildAgentContext, clearDigests, hasDigests,
  refreshFolder, refreshStale, resolveWatchedFolder, warmWatchedFolders,
} from '@/lib/folder-digests'
import type { AgentStep, AgentQuestion } from '@/lib/api'
import { getSession } from '@/lib/session'

const eAPI = typeof window !== 'undefined' ? (window as any).electronAPI : undefined
const isElectron = !!eAPI?.isElectron

// Minimal Web Speech API types — TypeScript's DOM lib doesn't ship them, which
// is why SpeechRecognition/SpeechRecognitionEvent were unresolved names here.
interface SpeechRecognitionAlternative { transcript: string; confidence: number }
interface SpeechRecognitionResultLike {
  readonly length: number
  readonly isFinal: boolean
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionResultListLike {
  readonly length: number
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}
interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string
  readonly message: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onstart: (() => void) | null
  onend: (() => void) | null
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
}

/** Plain-English reason for a speech recognition failure. */
function voiceErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was blocked. Allow it in your browser settings and try again.'
    case 'audio-capture':
      return 'No microphone found. Check that one is plugged in and enabled.'
    case 'no-speech':
      return "Didn't catch that — try speaking again."
    case 'network':
      return isElectron
        ? 'Voice input needs the browser version — the desktop app cannot reach the speech service.'
        : 'Voice input needs an internet connection.'
    case 'aborted':
      return ''
    default:
      return `Voice input failed (${code}).`
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
  /** File changes waiting for the user to approve. Nothing has run yet. */
  pending?: AgentOperation[]
  /** Set once the user has answered, so the buttons stop being offered. */
  decision?: 'applied' | 'cancelled'
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


// ─── Pending-change confirmation ──────────────────────────────────────────────

/** Plain-English description of one planned operation. */
function describeOp(op: AgentOperation): string {
  const base = (p?: string | null) => (p ? p.split(/[\/]/).filter(Boolean).pop() ?? p : '')
  switch (op.type) {
    case 'move_file':
    case 'move_files':
    case 'move_folder':
      return `Move ${base(op.source)} → ${op.destination ?? ''}`
    case 'copy_files':
      return `Copy ${base(op.source)} → ${op.destination ?? ''}`
    case 'rename':
      return `Rename ${base(op.path)} → ${op.new_name ?? ''}`
    case 'create_folder':
      return `Create folder ${base(op.path)}`
    case 'organize_by_type':
      return `Sort ${base(op.source)} into folders by file type`
    case 'delete_file':
    case 'delete_folder_recursive':
      return `Move ${base(op.path)} to the Recycle Bin`
    case 'permanently_delete_file':
    case 'permanently_delete_folder':
      return `Permanently delete ${base(op.path)} — cannot be undone`
    case 'archive':
    case 'archive_file':
    case 'archive_folder':
      return `Archive ${base(op.path ?? op.source)}`
    default:
      return `${op.type.replace(/_/g, ' ')} ${base(op.path ?? op.source)}`.trim()
  }
}

const PERMANENT = new Set(['permanently_delete_file', 'permanently_delete_folder'])

/**
 * Nothing touches the disk until this is answered.
 *
 * The assistant used to say it had "prepared" changes and point at the Organize
 * page, where they were nowhere to be found — so it could never actually do
 * anything it was asked. Now the plan is shown here and applied on request.
 */
function PendingChanges({
  ops, decision, busy, onApply, onCancel,
}: {
  ops: AgentOperation[]
  decision?: 'applied' | 'cancelled'
  busy: boolean
  onApply: () => void
  onCancel: () => void
}) {
  const permanent = ops.some(o => PERMANENT.has(o.type))

  if (decision === 'applied') return null
  if (decision === 'cancelled') {
    return <p className="mt-2 text-xs text-muted-foreground">Cancelled — nothing was changed.</p>
  }

  return (
    <div className={cn(
      'mt-3 rounded-lg border p-3',
      permanent ? 'border-red-200 bg-red-50/60 dark:bg-red-950/20' : 'border-border bg-muted/40',
    )}>
      <p className="text-xs font-medium text-foreground">
        {permanent ? 'This permanently deletes files' : 'Review before I make these changes'}
      </p>
      <ul className="mt-2 space-y-1">
        {ops.map((op, i) => (
          <li key={i} className="text-xs text-muted-foreground font-mono break-all">
            • {describeOp(op)}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onApply}
          disabled={busy}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-60',
            permanent ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:opacity-90',
          )}
        >
          {busy ? 'Working…' : permanent ? 'Yes, delete permanently' : 'Apply changes'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
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

function AssistantMessage({ msg, onRetry, onApply, onCancel, applying }: {
  msg: ChatMessage
  onRetry: (id: string) => void
  onApply: (id: string) => void
  onCancel: (id: string) => void
  applying: string | null
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
        {msg.pending && msg.pending.length > 0 && (
          <PendingChanges
            ops={msg.pending}
            decision={msg.decision}
            busy={applying === msg.id}
            onApply={() => onApply(msg.id)}
            onCancel={() => onCancel(msg.id)}
          />
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

/** Phrasings that mean "go and look at the disk again", not "chat with me". */
const RESCAN_RE = /\b(re-?scan|scan|refresh|check again|look again|update the scan)\b/i

/**
 * Which folder the user meant, if they named one.
 * Returns null for "rescan everything", which then refreshes all of them.
 */
function extractFolderTarget(text: string): string | null {
  const m = text.match(/\b(?:scan|rescan|refresh|check)\s+(?:my\s+|the\s+)?([\w .\\/:-]+?)(?:\s+folder)?\s*[?.!]?$/i)
  const target = m?.[1]?.trim()
  if (!target) return null
  if (/^(everything|all|it|again|them|my files|files)$/i.test(target)) return null
  return target
}

/**
 * Rebuild the agent's view of the user's folders when it has gone stale.
 *
 * This used to rescan every watched folder on every message, sending the first
 * 300 filenames of each and no totals — slow, and it made the model count the
 * sample instead of the folder. Digests are cached and carry complete counts;
 * see lib/folder-digests.ts.
 */
async function refreshAgentContext(force = false): Promise<AgentContext | null> {
  if (!isElectron) return null
  const session = getSession()
  if (!session) return null
  const userId = session.email

  try {
    if (!hasDigests()) {
      await warmWatchedFolders(userId)
    } else {
      await refreshStale(force)
    }
    return buildAgentContext(userId)
  } catch (err) {
    console.error('[agent] could not build folder context', err)
    return null
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
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [palette, setPalette] = useState<PaletteState | null>(null)
  const [applying, setApplying] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const transcriptRef = useRef('')

  // Warm the folder digests once, in the background, so the first question the
  // user asks is answered from real data instead of triggering a cold scan.
  // Digests are dropped whenever the account changes — one user's scan must
  // never be visible to the next.
  useEffect(() => {
    let cancelled = false
    const session = getSession()
    if (!session || !isElectron) return

    const userId = session.email
    warmWatchedFolders(userId).catch(err =>
      console.error('[agent] could not warm watched folders', err))

    const onSessionChange = () => {
      clearDigests()
      const next = getSession()
      if (next && !cancelled) {
        warmWatchedFolders(next.email).catch(() => {})
      }
    }
    window.addEventListener('mm:session-change', onSessionChange)
    return () => {
      cancelled = true
      window.removeEventListener('mm:session-change', onSessionChange)
    }
  }, [])

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
    setVoiceError(null)
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) {
      setVoiceError(
        isElectron
          ? 'Voice input is only available in the browser version of Mini Manager.'
          : 'Voice input is not supported in this browser. Try Chrome or Edge.',
      )
      return
    }

    let failed = false
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognitionRef.current = recognition

    recognition.onstart = () => { setListening(true); transcriptRef.current = '' }

    recognition.onresult = (e) => {
      let t = ''
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      transcriptRef.current = t
      setInput(t)
    }

    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
      if (failed) return // don't send a half transcript after an error
      const t = transcriptRef.current.trim()
      if (t) { transcriptRef.current = ''; setInput(''); sendMessage(t) }
    }

    // Previously swallowed the error entirely, so a blocked mic looked like
    // nothing happening at all.
    recognition.onerror = (e) => {
      failed = true
      setListening(false)
      recognitionRef.current = null
      const msg = voiceErrorMessage(e?.error ?? 'unknown')
      if (msg) setVoiceError(msg)
    }

    try {
      recognition.start()
    } catch {
      failed = true
      setListening(false)
      recognitionRef.current = null
      setVoiceError('Could not start voice input. Try again.')
    }
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
      const wantsRescan = RESCAN_RE.test(txt)
      let context = await refreshAgentContext(wantsRescan)

      const apiHistory = history.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }))
      const res = await apiAgent(apiHistory, undefined, undefined, context)
      const questions = res.questions ?? []

      // "Task complete" may only come from work that actually ran. Steps the
      // model wrote itself are narration, and are shown without the chip.
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`, role: 'ai', text: res.reply, ts: Date.now(),
        status: res.executed ? 'complete' : undefined,
        steps: res.steps ?? [],
        pending: res.pendingOperations,
      }])

      // If clarification needed, open the docked palette
      if (res.needs_clarification && questions.length > 0 && questions.some(q => (q.options ?? []).length > 0)) {
        setPalette({ questions, page: 0, cursor: 0, answers: [] })
        return
      }

      // A scan on its own answers nothing — the user asked a question. Feed the
      // fresh folder data back so the reply becomes "Done. You have 200 images
      // — 84 JPG, 116 PNG" instead of a bare "Done · 1 step".
      if (wantsRescan && !res.needs_clarification) {
        const target = extractFolderTarget(txt)
        const steps: string[] = []
        if (target) {
          const match = resolveWatchedFolder(target)
          if (match) {
            const d = await refreshFolder(match.path, match.label)
            steps.push(`${d.label}: ${d.total_files} files`)
          }
        } else {
          const touched = await refreshStale(true)
          if (touched.length) steps.push(`Rescanned ${touched.join(', ')}`)
        }

        const session = getSession()
        context = session ? buildAgentContext(session.email) : null

        if (context && steps.length) {
          const followUp = await apiAgent(
            [...apiHistory, { role: 'assistant', content: res.reply }],
            undefined, undefined, context,
            { summary: steps.join('; '), steps },
          )
          setMessages(prev => [...prev, {
            id: `ai-f-${Date.now()}`, role: 'ai', text: followUp.reply, ts: Date.now(),
            status: 'complete',
            steps: steps.map(s => ({ label: s, status: 'done' })) as AgentStep[],
          }])
        }
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

  /**
   * Run the changes the user just approved, then show what actually happened.
   * Results come back per operation, so a partial failure is reported honestly
   * rather than as blanket success.
   */
  async function handleApply(msgId: string) {
    const msg = messages.find(m => m.id === msgId)
    if (!msg?.pending?.length) return
    setApplying(msgId)
    try {
      const results = await runAgentOperations(msg.pending)
      const failed = results.filter(r => r.status !== 'done')
      setMessages(prev => prev.map(m => m.id === msgId
        ? {
            ...m,
            decision: 'applied',
            status: failed.length === results.length ? 'failed' : 'complete',
            steps: results.map(r => ({
              label: r.detail,
              status: r.status === 'done' ? 'done' : 'failed',
            })) as AgentStep[],
          }
        : m))
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === msgId
        ? {
            ...m, decision: 'applied', status: 'failed',
            steps: [{
              label: err instanceof Error ? err.message : 'Could not apply the changes',
              status: 'failed',
            }] as AgentStep[],
          }
        : m))
    } finally {
      setApplying(null)
    }
  }

  function handleCancelPending(msgId: string) {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, decision: 'cancelled' } : m))
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
              : <AssistantMessage
                  key={msg.id} msg={msg} onRetry={handleRetry}
                  onApply={handleApply} onCancel={handleCancelPending}
                  applying={applying}
                />
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
            {/* Shown even when unsupported, so clicking explains why rather than
                the button silently not existing. */}
            <button
              onClick={() => (listening ? stopListening() : startListening())}
              title={voiceSupported ? (listening ? 'Stop recording' : 'Voice input') : 'Voice input unavailable'}
              aria-label={listening ? 'Stop recording' : 'Start voice input'}
              className={cn('flex size-9 items-center justify-center rounded-xl transition-colors',
                listening
                  ? 'bg-red-500 text-white'
                  : voiceSupported
                  ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  : 'text-muted-foreground/40 hover:bg-accent hover:text-muted-foreground')}>
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
            <button onClick={() => sendMessage()} disabled={!input.trim() || thinking}
              className="flex size-9 items-center justify-center rounded-xl bg-primary text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground hover:bg-primary/90 transition-all">
              <SendHorizonal className="size-4" />
            </button>
          </div>
        </div>
        {voiceError && (
          <p className="mt-2 flex items-start gap-1.5 text-center text-xs text-destructive justify-center">
            <span>{voiceError}</span>
            <button onClick={() => setVoiceError(null)} className="underline underline-offset-2 shrink-0">
              dismiss
            </button>
          </p>
        )}
        {listening && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Listening… speak now</p>
        )}
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
