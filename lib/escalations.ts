/**
 * Escalations — the agent asking for a decision.
 *
 * An escalation is a durable thing, not a toast. It survives the app being
 * closed, because the run that raised it may have happened while the user was
 * away, which is the entire point of autonomy.
 *
 * Delivery is deliberately ordered: a desktop notification if the app is
 * running, an in-app badge otherwise. There is no email pipeline, and building
 * one is not worth the time.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

function token(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('mm.token') ?? sessionStorage.getItem('mm.token')
}

export interface EscalationFile {
  file?: string
  folder?: string
  target?: string
  why?: string
  reason?: string
}

export interface Escalation {
  id: string
  run_id: string
  reason: string
  files: EscalationFile[]
  /** The agent's own sentence about why it stopped. Show this, not a count. */
  agent_note: string
  options: string[]
  created_at: string
}

/** Keys of escalations already announced, so the same one is not shown twice. */
const SEEN_KEY = 'mm.escalations.announced'

function alreadyAnnounced(id: string): boolean {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    return seen.includes(id)
  } catch {
    return false
  }
}

function markAnnounced(ids: string[]): void {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    // Bounded — this only exists to stop repeat notifications, not as history.
    const next = [...new Set([...seen, ...ids])].slice(-200)
    localStorage.setItem(SEEN_KEY, JSON.stringify(next))
  } catch {
    // storage unavailable — worst case is a notification shown twice
  }
}

export async function fetchEscalations(): Promise<Escalation[]> {
  const jwt = token()
  if (!jwt) return []

  const res = await fetch(`${BASE}/api/v1/escalations`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })
  if (!res.ok) return []

  const raw = await res.json()
  return (Array.isArray(raw) ? raw : []).map((e: any) => ({
    ...e,
    // Both of these are JSONB columns, and asyncpg hands JSONB back as text —
    // so they arrive as strings, not arrays. Parsing one and not the other is
    // how the decisions screen crashed on options.map: the shape looked right
    // until something iterated it.
    files: asArray<EscalationFile>(e.files),
    options: asArray<string>(e.options),
  }))
}

/** A JSONB column as an array, whether it arrived parsed or as text. */
function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * Announce anything new.
 *
 * Returns every open escalation so the caller can render a badge, having
 * already notified about the ones not seen before. The desktop notification
 * carries the agent's sentence; falling back to the badge is not a failure,
 * it is the other half of the design.
 */
export async function announceNewEscalations(): Promise<Escalation[]> {
  const all = await fetchEscalations()
  const fresh = all.filter(e => !alreadyAnnounced(e.id))
  if (!fresh.length) return all

  const api = typeof window !== 'undefined' ? window.electronAPI : undefined

  if (api?.showNotification) {
    for (const e of fresh.slice(0, 3)) {
      const files = e.files ?? []
      await api.showNotification({
        // The agent's own words. A count would be a status bar; this is a reason.
        title: e.agent_note || 'I need a decision from you',
        body: files.length > 1
          ? `${files.length} files in ${files[0]?.folder ?? 'your folders'}`
          : (files[0]?.folder ? `In ${files[0].folder}` : ''),
      }).catch(() => {})
    }
  }

  // Marked either way: the badge is the fallback, and re-notifying on every
  // poll would be worse than a missed toast.
  markAnnounced(fresh.map(e => e.id))
  return all
}
