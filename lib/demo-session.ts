/**
 * The guest demo's session and its sample folder.
 *
 * Two things live here, and they are related.
 *
 * **The session** is a short-lived token minted by the server. It is kept in
 * `sessionStorage` under its own key, never `mm.token`: a visitor who already
 * has an account must not have their real session overwritten by opening the
 * demo, and the demo must never run as them by accident.
 *
 * **The sample folder** is a fixed digest, not a real scan. A browser cannot
 * read a filesystem, so anything claiming to have organised the visitor's own
 * Downloads would be a lie. What is real is everything downstream: the digest
 * goes to the same agent, through the same tools, the same kernel and the same
 * confidence routing as the desktop app. The files are fictional; the reasoning
 * about them is not.
 *
 * The sample deliberately contains a passport scan and a bank statement,
 * because the single most important thing the demo has to show is the agent
 * refusing to touch them.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''
const TOKEN_KEY = 'mm.demo.token'

export const DEMO_LIMIT = 8

export interface DemoState {
  actions_used: number
  actions_left: number
  limit: number
  exhausted: boolean
}

export interface DemoSession extends DemoState {
  token: string
  session_id: string
}

export function storedDemoToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(TOKEN_KEY)
}

function store(token: string): void {
  try { sessionStorage.setItem(TOKEN_KEY, token) } catch { /* private mode */ }
}

export function clearDemoToken(): void {
  try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

/**
 * Get the current guest session, or start one.
 *
 * Reuses an existing token so a refresh does not hand out five fresh actions —
 * that would make the limit decorative, which is the whole thing the server-side
 * ledger exists to prevent.
 */
export async function openDemoSession(): Promise<DemoSession> {
  const existing = storedDemoToken()
  if (existing) {
    const state = await fetchDemoState(existing)
    if (state) return { ...state, token: existing, session_id: '' }
    clearDemoToken()     // expired or unknown to the server
  }

  const res = await fetch(`${BASE}/api/v1/demo/session`, { method: 'POST' })
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        'The demo has been started several times from this network recently. ' +
        'Please try again in a little while.',
      )
    }
    throw new Error('Could not start the demo. Please try again.')
  }

  const session: DemoSession = await res.json()
  store(session.token)
  return session
}

export async function fetchDemoState(token: string): Promise<DemoState | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/demo/state`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

/**
 * Spend one action for something that never reaches the agent.
 *
 * Agent turns are counted inside the agent route instead, so applying and
 * undoing go through here and chatting does not — otherwise a single message
 * would cost two.
 *
 * Returns null when the demo is spent, which the page renders as the end state.
 */
export async function spendAction(
  token: string,
  kind: 'scan' | 'apply' | 'undo' | 'correction',
): Promise<DemoState | null> {
  const res = await fetch(`${BASE}/api/v1/demo/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind }),
  })
  if (res.status === 402) return null
  if (!res.ok) throw new Error('Something went wrong. Please try again.')
  return res.json()
}

// ─── The sample folder ────────────────────────────────────────────────────────
//
// Shaped exactly like lib/folder-digests.ts::buildDigest, because the agent's
// scan_folder tool reads that shape and must not be able to tell the
// difference. Paths use a Windows flavour so the kernel's path handling is
// exercised the same way it is on a real desktop.

const ROOT = 'C:\\Users\\Guest\\Downloads'

interface SlimFile { n: string; s: number; m: string; p: string }

function f(name: string, kb: number, daysAgo: number): SlimFile {
  const when = new Date(Date.now() - daysAgo * 86_400_000)
  return { n: name, s: kb * 1024, m: when.toISOString(), p: `${ROOT}\\${name}` }
}

const SAMPLE_FILES: SlimFile[] = [
  // The two that matter. Both are confidently classifiable and both must be
  // escalated anyway, which is the demo's whole argument.
  f('passport_scan.jpg', 2_480, 41),
  f('bank_statement_march.pdf', 318, 12),

  // Ordinary, confidently filed. Without these the agent looks like it escalates
  // everything, which would be useless rather than careful.
  f('Invoice_Q3_2026.pdf', 214, 8),
  f('lecture_notes_week4.txt', 12, 21),
  f('budget_tracker_2026.xlsx', 88, 3),
  f('resume_final_v3.docx', 46, 60),
  f('holiday_photo_01.jpg', 3_950, 95),
  f('holiday_photo_02.jpg', 4_110, 95),
  f('screenshot_2026-08-14.png', 640, 28),
  f('project_spec_draft.docx', 132, 5),
  f('setup_installer.exe', 84_300, 140),
  f('podcast_ep_212.mp3', 48_200, 33),

  // Old and untouched, so find_stale has something true to say.
  f('tax_return_2019.pdf', 402, 900),
  f('old_backup.zip', 152_000, 740),
]

export function sampleDigest() {
  const by_extension: Record<string, { count: number; bytes: number }> = {}
  let total_bytes = 0
  let stale_count = 0
  const yearAgo = Date.now() - 365 * 86_400_000

  for (const file of SAMPLE_FILES) {
    const ext = file.n.includes('.') ? file.n.split('.').pop()!.toLowerCase() : 'none'
    by_extension[ext] ??= { count: 0, bytes: 0 }
    by_extension[ext].count++
    by_extension[ext].bytes += file.s
    total_bytes += file.s
    if (new Date(file.m).getTime() < yearAgo) stale_count++
  }

  const bySize = [...SAMPLE_FILES].sort((a, b) => b.s - a.s)
  const byDate = [...SAMPLE_FILES].sort((a, b) => a.m.localeCompare(b.m))

  return {
    root: ROOT,
    label: 'Downloads (sample)',
    scanned_at: Date.now(),
    total_files: SAMPLE_FILES.length,
    total_bytes,
    by_extension,
    stale_count,
    empty_count: 0,
    sample_largest: bySize.slice(0, 15),
    sample_newest: [...byDate].reverse().slice(0, 10),
    sample_oldest: byDate.slice(0, 10),
    all_files: SAMPLE_FILES,
    all_files_truncated: false,
  }
}

export function sampleScanContext() {
  return { watched_folders: [sampleDigest()] }
}

export const SAMPLE_FILE_COUNT = SAMPLE_FILES.length
