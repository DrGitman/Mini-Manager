/**
 * The autonomous scheduler, driven from the device.
 *
 * The server decides *whether* a run is owed; the device decides *when to ask*
 * and supplies the folder digests, because a hosted backend cannot read the
 * user's disk. So this is the piece that makes autonomy real rather than
 * theoretical — /runs/due has been working with nothing calling it.
 *
 * Asking on launch is what handles a machine that was switched off. There is no
 * catch-up loop: the server computes from the schedule and the last run, so two
 * days offline owes one run, not eight.
 */

import { apiGetPreferences } from '@/lib/api'
import { buildAgentContext, resolveScopeFolders, refreshFolder } from '@/lib/folder-digests'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

/** How often to ask. The server enforces the real interval; this is just polling. */
const ASK_EVERY_MS = 15 * 60 * 1000

const LAST_ASKED_KEY = 'mm.scheduler.lastAsked'

function token(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('mm.token') ?? sessionStorage.getItem('mm.token')
}

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  const jwt = token()
  if (!jwt) return null
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export interface RunOutcome {
  run_id: string
  summary: string
  files_applied: number
  escalations: number
  operations: { type: string; source?: string; destination?: string; path?: string; name?: string }[]
}

/**
 * Run once if one is owed.
 *
 * Returns the outcome, or null if nothing was due — so the caller can tell the
 * difference between "did nothing because it was not time" and "did nothing
 * because it failed", which look identical from the outside otherwise.
 */
export async function runIfDue(force = false): Promise<RunOutcome | null> {
  const api_ = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api_) return null            // only the desktop app can supply digests

  if (!force) {
    const due = await api<{ due: boolean }>('/api/v1/runs/due')
    if (!due?.due) return null
  }

  // Fresh digests. A scheduled run reading a stale scan would report on files
  // that have already moved.
  const scope = await resolveScopeFolders()
  if (!scope.length) return null
  for (const folder of scope) {
    await refreshFolder(folder.path, folder.label)
  }

  const session = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('mm.session') ?? sessionStorage.getItem('mm.session') ?? 'null')
    : null
  const context = session ? buildAgentContext(session.email) : null
  if (!context?.watched_folders?.length) return null

  const prefs = await apiGetPreferences().catch(() => null)

  const outcome = await api<RunOutcome>('/api/v1/runs', {
    method: 'POST',
    body: JSON.stringify({
      digests: context.watched_folders,
      preferences: prefs ?? undefined,
      trigger: force ? 'manual' : 'scheduled',
    }),
  })
  if (!outcome) return null

  // The server planned; the device carries it out. Nothing has moved yet.
  if (outcome.operations?.length && api_.runOperations) {
    try {
      await api_.runOperations(outcome.operations as never)
    } catch {
      // The run itself is still recorded and the escalations still stand.
      // A failed execution is not a failed run.
    }
  }

  return outcome
}

/**
 * Start asking, on launch and then periodically.
 *
 * Returns a cleanup function. Deliberately quiet: a scheduled run that finds
 * nothing to do should be invisible, and one that finds something announces
 * itself through the escalation badge and the summary card.
 */
export function startScheduler(): () => void {
  if (typeof window === 'undefined' || !window.electronAPI) return () => {}

  let stopped = false

  const tick = async () => {
    if (stopped) return
    try {
      localStorage.setItem(LAST_ASKED_KEY, String(Date.now()))
      await runIfDue()
    } catch {
      // Never let the scheduler surface an error. It runs unattended by
      // definition, and a toast about a background poll is noise.
    }
  }

  // On launch — this is what catches a machine that was off.
  const initial = setTimeout(tick, 8_000)
  const timer = setInterval(tick, ASK_EVERY_MS)

  return () => {
    stopped = true
    clearTimeout(initial)
    clearInterval(timer)
  }
}
