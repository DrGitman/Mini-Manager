'use client'

/**
 * What the agent did while you were away.
 *
 * Shown when the app opens, because an autonomous run happens when nobody is
 * looking and the only honest way to report it is afterwards.
 *
 * The body is the agent's own account — "I deliberately left your passport scan
 * alone because it looks private" — not a stat block. The numbers are there,
 * small, underneath. A person reading a sentence about their own passport
 * understands what happened; a person reading "1 applied, 3 skipped" has to
 * work it out, and mostly does not bother.
 */

import { useEffect, useState } from 'react'
import { Sparkles, X, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { timeAgo } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''
const DISMISSED_KEY = 'mm.run.dismissed'

interface LatestRun {
  id: string
  trigger: string
  summary: string
  started_at: string
  files_seen: number
  files_applied: number
  escalations: number
  status: string
}

function token(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('mm.token') ?? sessionStorage.getItem('mm.token')
}

export function RunSummary() {
  const [run, setRun] = useState<LatestRun | null>(null)
  const [openEscalations, setOpenEscalations] = useState(0)
  const [dismissed, setDismissed] = useState(true)   // hidden until we know

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const jwt = token()
      if (!jwt) return
      try {
        const res = await fetch(`${BASE}/api/v1/runs/latest`, {
          headers: { Authorization: `Bearer ${jwt}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !data.run) return

        // Dismissal is per run, not global — the next run has something new to
        // say, and hiding it because the last one was dismissed would make
        // autonomy invisible.
        const seen = localStorage.getItem(DISMISSED_KEY)
        setRun(data.run)
        setOpenEscalations(data.open_escalations ?? 0)
        setDismissed(seen === data.run.id)
      } catch {
        // A missing summary is not worth an error state.
      }
    })()

    return () => { cancelled = true }
  }, [])

  if (!run || dismissed || !run.summary?.trim()) return null

  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY, run!.id) } catch {}
    setDismissed(true)
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
          <Sparkles className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {run.trigger === 'scheduled' ? 'While you were away' : 'Last run'}
            </p>
            <span className="text-xs text-muted-foreground">
              {timeAgo(new Date(run.started_at).getTime())}
            </span>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* The agent's own account. This is the point of the card. */}
          <p className="mt-2 text-[15px] leading-[1.6] text-foreground">
            {run.summary}
          </p>

          {/* Numbers, deliberately secondary. */}
          <p className="mt-2 text-xs text-muted-foreground">
            {run.files_seen} file{run.files_seen === 1 ? '' : 's'} looked at
            {run.files_applied > 0 && ` · ${run.files_applied} organised`}
            {run.escalations > 0 && ` · ${run.escalations} left for you`}
          </p>

          {openEscalations > 0 && (
            <Link
              href="/decisions"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-600 hover:underline"
            >
              Review {openEscalations} decision{openEscalations === 1 ? '' : 's'}
              <ChevronRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
