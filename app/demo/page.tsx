'use client'

/**
 * The public guest demo.
 *
 * Deliberately outside the `(app)` route group, because that group's layout
 * redirects to /login whenever there is no session and the entire point here is
 * that there is no account.
 *
 * What is fake: the folder. A browser cannot read a filesystem, so the files
 * are a fixed sample.
 *
 * What is real: everything else. The same Strands agent, the same eleven tools,
 * the same safety kernel, the same confidence routing. The tool trace below is
 * emitted as each tool actually executes — it is not a scripted animation, and
 * the passport is escalated because `propose_changes` re-derives sensitivity,
 * not because this page hardcoded it.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Sparkles, Loader2, ShieldAlert, Check, FolderSearch,
  ArrowRight, Code2, AlertCircle,
} from 'lucide-react'
import { streamAgent, type AgentToolEvent } from '@/lib/agent-stream'
import {
  openDemoSession, sampleScanContext, SAMPLE_FILE_COUNT,
  DEMO_LIMIT, type DemoState,
} from '@/lib/demo-session'

const REPO = 'https://github.com/DrGitman/Mini-Manager'

// Human phrasing for each tool, so the trace reads as work rather than as
// function names. Mirrors the labels the desktop app uses.
function describeTool(name: string): string {
  switch (name) {
    case 'scan_folder':        return 'Looking through the folder'
    case 'query_files':        return 'Counting files'
    case 'find_stale':         return 'Finding files untouched for a while'
    case 'check_rules':        return 'Checking your filing rules'
    case 'recall_corrections': return 'Recalling past corrections'
    case 'classify_files':     return 'Working out where things belong'
    case 'check_sensitive':    return 'Checking for anything private'
    case 'propose_changes':    return 'Deciding what needs your say-so'
    case 'apply_changes':      return 'Preparing the approved changes'
    case 'quarantine':         return 'Moving things to the Archive'
    case 'notify_user':        return 'Asking you about something'
    default:                   return name.replace(/_/g, ' ')
  }
}

const SUGGESTIONS = [
  'Organise this folder',
  'What is in here that looks private?',
  'What have I not touched in a year?',
]

export default function DemoPage() {
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<DemoState | null>(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState('')

  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<string[]>([])
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const traceEnd = useRef<HTMLDivElement>(null)

  const [slowBoot, setSlowBoot] = useState(false)

  useEffect(() => {
    let cancelled = false

    // The API sleeps on Render's free tier and takes about a minute to wake.
    // A spinner with no explanation reads as broken at that length, and the
    // person waiting is a judge deciding whether to bother. Saying what is
    // happening costs nothing and keeps them on the page.
    const slow = setTimeout(() => !cancelled && setSlowBoot(true), 4000)

    openDemoSession()
      .then(s => {
        if (cancelled) return
        setToken(s.token)
        setState(s)
      })
      .catch(e => !cancelled && setBootError(e.message))
      .finally(() => {
        if (cancelled) return
        clearTimeout(slow)
        setBooting(false)
      })

    return () => { cancelled = true; clearTimeout(slow) }
  }, [])

  useEffect(() => {
    traceEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps, reply])

  const exhausted = state?.exhausted ?? false
  const left = state?.actions_left ?? DEMO_LIMIT

  const ask = useCallback(async (message: string) => {
    if (!token || running || exhausted) return

    setRunning(true)
    setSteps([])
    setReply('')
    setError('')

    // The action is spent server-side inside the agent route, so the count is
    // refreshed from the response rather than decremented optimistically here.
    // A guess would drift the moment anything failed.
    await streamAgent(
      {
        message,
        scanContext: sampleScanContext(),
        preferences: { auto_threshold: 0.85, review_threshold: 0.70 },
        authToken: token,
      },
      {
        onTool: (t: AgentToolEvent) =>
          setSteps(prev => prev.includes(describeTool(t.name))
            ? prev
            : [...prev, describeTool(t.name)]),
        onText: chunk => setReply(prev => prev + chunk),
        onError: msg => setError(msg),
      },
    )

    const fresh = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1/demo/state`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).then(r => (r.ok ? r.json() : null)).catch(() => null)
    if (fresh) setState(fresh)

    setRunning(false)
  }, [token, running, exhausted])

  // ── Boot states ───────────────────────────────────────────────────────────

  if (booting) {
    return (
      <Shell>
        <div className="max-w-sm text-center">
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
          <p className="mt-4 text-[15px] text-foreground">Starting the demo…</p>
          {slowBoot && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              The server sleeps when nobody is using it and takes up to a minute to
              wake. This only happens on the first visit.
            </p>
          )}
        </div>
      </Shell>
    )
  }

  if (bootError) {
    return (
      <Shell>
        <div className="max-w-md rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <AlertCircle className="size-5 text-amber-500" />
          <p className="mt-3 text-[15px] text-foreground">{bootError}</p>
          <a href={REPO} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Read the code on GitHub <ArrowRight className="size-3.5" />
          </a>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Mini Manager, live</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The real agent, on a sample folder of {SAMPLE_FILE_COUNT} files. No account needed.
            </p>
          </div>
          <ActionCounter left={left} limit={state?.limit ?? DEMO_LIMIT} />
        </div>

        {/* Honesty note. A judge should never have to guess what is real. */}
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <FolderSearch className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            The folder is a fixed sample, because a browser cannot read your disk.
            Everything after that is real: the same agent, the same tools, the same
            safety kernel, and the same confidence thresholds the desktop app uses.
            Nothing here touches a file on your machine.
          </p>
        </div>

        {exhausted ? <Exhausted /> : (
          <>
            {/* Prompt */}
            <form
              onSubmit={e => { e.preventDefault(); const t = input.trim(); if (t) { setInput(''); ask(t) } }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={running}
                placeholder="Ask the agent to do something…"
                className="h-11 flex-1 rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={running || !input.trim()}
                className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {running ? <Loader2 className="size-4 animate-spin" /> : 'Run'}
              </button>
            </form>

            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={running}
                  className="rounded-full border border-border px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Live tool trace — emitted as each tool executes, not narrated. */}
        {(steps.length > 0 || reply || error) && (
          <div className="mt-7 rounded-xl border border-border bg-card p-5">
            {steps.length > 0 && (
              <div className="mb-4">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  What it actually did
                </p>
                <ol className="space-y-1.5">
                  {steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <Check className="size-3.5 shrink-0 text-emerald-500" />
                      {s}
                    </li>
                  ))}
                  {running && (
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 shrink-0 animate-spin" />
                      Thinking…
                    </li>
                  )}
                </ol>
              </div>
            )}

            {reply && (
              <div className="flex gap-3 border-t border-border pt-4">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
                  <Sparkles className="size-3.5" />
                </div>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                  {reply}
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 border-t border-border pt-4 text-sm text-amber-600">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        <div ref={traceEnd} />
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen justify-center bg-background px-5 py-12 sm:px-6">
      {children}
    </main>
  )
}

function ActionCounter({ left, limit }: { left: number; limit: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: limit }, (_, i) => (
          <span
            key={i}
            className={`size-2 rounded-full ${i < left ? 'bg-primary' : 'bg-border'}`}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">
        {left} of {limit} {left === 1 ? 'action' : 'actions'} left
      </span>
    </div>
  )
}

function Exhausted() {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-6">
      <h2 className="text-lg font-semibold text-foreground">That is the demo</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        You have used all {DEMO_LIMIT} actions. What you just saw was the real agent:
        it chose its own tools, scored every file, and refused to move the private ones
        without asking.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        The full version runs on a schedule against your own folders, works while you are
        away, and carries out changes on your machine rather than only planning them.
        The desktop app is not released yet.
      </p>
      <a
        href={REPO}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        <Code2 className="size-4" />
        Read the code on GitHub
      </a>
    </div>
  )
}
