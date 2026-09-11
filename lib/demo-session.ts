/**
 * Guest mode for the real app.
 *
 * The demo is not a separate build or a mock-up of the product. It is the
 * actual application, signed in as a guest, with a server-side cap on how many
 * things it will do. Every screen, every component and every code path is the
 * one that ships — which is the only version worth showing a judge, and the
 * only one that cannot drift away from the real thing.
 *
 * Two limits make that safe on a public endpoint: the guest token expires in
 * two hours, and a ledger in Postgres counts actions per session and per IP.
 * Neither lives in the browser, because both guard real model spend.
 *
 * The folder is the one thing that is not real. A browser cannot read a
 * filesystem, so the demo supplies a fixed sample file list. It then goes
 * through the same classifier, the same confidence routing and the same
 * sensitivity checks as a real scan — so the files are fictional and every
 * judgement about them is not.
 */

import type { FileMeta } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

/** Marks the current session as a guest one. Read by the app shell. */
export const DEMO_FLAG_KEY = 'mm.demo.active'

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

export function isDemoSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(DEMO_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function markDemoSession(): void {
  try { sessionStorage.setItem(DEMO_FLAG_KEY, '1') } catch { /* private mode */ }
}

export function clearDemoSession(): void {
  try { sessionStorage.removeItem(DEMO_FLAG_KEY) } catch { /* ignore */ }
}

/** Ask the server for a guest token. */
export async function startDemoSession(): Promise<DemoSession> {
  const res = await fetch(`${BASE}/api/v1/demo/session`, { method: 'POST' })
  if (!res.ok) {
    if (res.status === 429) {
      const body = await res.json().catch(() => null)
      throw new Error(
        body?.detail ??
        'The demo has already been used from this network today. It resets after 24 hours.',
      )
    }
    throw new Error('Could not start the demo. Please try again.')
  }
  return res.json()
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

// ─── The sample folder ────────────────────────────────────────────────────────
//
// Shaped as FileMeta so it drops straight into the Organize screen's existing
// pipeline — the same one a real folder pick produces. Nothing downstream knows
// or cares that these files were not read off a disk.

function f(name: string, kb: number, daysAgo: number): FileMeta {
  const dot = name.lastIndexOf('.')
  return {
    id: `demo-${name}`,
    name,
    extension: dot === -1 ? '' : name.slice(dot + 1).toLowerCase(),
    relativePath: 'Downloads/',
    sizeBytes: kb * 1024,
    modifiedAt: Date.now() - daysAgo * 86_400_000,
  }
}

/**
 * The sample. Deliberately mixed.
 *
 * The passport and the bank statement are the point: both are easy to classify
 * confidently, and both must still be held back. A sample without them would
 * show an organiser. A sample of only them would show something useless that
 * refuses everything.
 */
export const DEMO_FILES: FileMeta[] = [
  f('passport_scan.jpg', 2_480, 41),
  f('bank_statement_march.pdf', 318, 12),
  f('tax_return_2019.pdf', 402, 900),

  f('Invoice_Q3_2026.pdf', 214, 8),
  f('lecture_notes_week4.txt', 12, 21),
  f('budget_tracker_2026.xlsx', 88, 3),
  f('resume_final_v3.docx', 46, 60),
  f('project_spec_draft.docx', 132, 5),
  f('meeting_notes_2026-08-02.md', 9, 35),

  f('holiday_photo_01.jpg', 3_950, 95),
  f('holiday_photo_02.jpg', 4_110, 95),
  f('screenshot_2026-08-14.png', 640, 28),
  f('logo_draft_v2.png', 410, 52),

  f('setup_installer.exe', 84_300, 140),
  f('podcast_ep_212.mp3', 48_200, 33),
  f('old_backup.zip', 152_000, 740),
]

export const DEMO_FOLDER_NAME = 'Downloads (sample)'
