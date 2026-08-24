'use client'

/**
 * Decisions — the things the agent stopped over.
 *
 * This is the screen the escalation badge and the run summary both point at,
 * and the piece that closes the loop: without it the agent can ask and the user
 * has no way to answer.
 *
 * Each item leads with the agent's own sentence rather than a category, and
 * offers the choices the agent itself proposed. Answering records the decision
 * rather than merely clearing a flag — it is the raw material for not asking
 * the same question twice.
 */

import { useEffect, useState } from 'react'
import { ShieldQuestion, Check, Loader2, Inbox } from 'lucide-react'
import { timeAgo } from '@/lib/types'
import { fetchEscalations, type Escalation } from '@/lib/escalations'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

function token(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('mm.token') ?? sessionStorage.getItem('mm.token')
}

export default function DecisionsPage() {
  const [items, setItems] = useState<Escalation[]>([])
  const [loading, setLoading] = useState(true)
  const [answering, setAnswering] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setItems(await fetchEscalations())
    } catch {
      setError('Could not load your decisions. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function answer(id: string, choice: string) {
    setAnswering(id)
    setError(null)
    try {
      const res = await fetch(`${BASE}/api/v1/escalations/${id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ choice }),
      })
      if (!res.ok) throw new Error(String(res.status))

      // Removed only once the server confirms. Dropping it optimistically would
      // hide a decision that was never recorded.
      const data = await res.json()
      if (data.resolved) {
        setItems(prev => prev.filter(i => i.id !== id))
      } else {
        setError('That decision was already answered.')
        await load()
      }
    } catch {
      setError('Could not save that decision. It is still waiting for you.')
    } finally {
      setAnswering(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading your decisions…
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
        <Inbox className="mb-3 size-8 text-muted-foreground/40" />
        <h3 className="text-sm font-medium text-foreground">Nothing needs you right now</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          When the assistant is unsure about something, it will wait for you here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Waiting on you</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The assistant stopped rather than guess. Nothing here has been changed.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {items.map(item => {
        const files = item.files ?? []
        const options = item.options?.length ? item.options : ['Apply it', 'Leave it']
        const busy = answering === item.id

        return (
          <div
            key={item.id}
            className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/10"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
                <ShieldQuestion className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                {/* The agent's own words. This is what the user reads first. */}
                <p className="text-[15px] leading-[1.6] text-foreground">
                  {item.agent_note || 'I stopped and would rather you decided.'}
                </p>

                {files.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {files.map((f, i) => (
                      <li key={i} className="text-xs text-muted-foreground font-mono break-all">
                        {f.file}
                        {f.folder ? <span className="text-muted-foreground/60"> · in {f.folder}</span> : null}
                        {f.target ? <span className="text-muted-foreground/60"> → {f.target}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {options.map(option => (
                    <button
                      key={option}
                      onClick={() => answer(item.id, option)}
                      disabled={busy}
                      className={
                        'rounded-md px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-60 ' +
                        (/apply|move/i.test(option)
                          ? 'bg-primary text-white hover:opacity-90'
                          : 'border border-border bg-background text-muted-foreground hover:bg-accent')
                      }
                    >
                      {busy ? <Loader2 className="size-3 animate-spin" /> : option}
                    </button>
                  ))}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {timeAgo(new Date(item.created_at).getTime())}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
