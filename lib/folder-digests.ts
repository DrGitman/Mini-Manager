/**
 * What the agent knows about the user's folders.
 *
 * The panel used to rescan every watched folder on every single message and
 * send the first 300 files of each with no totals. That produced answers like
 * "9 image files listed in the recent context" — the model counting the sample
 * it was handed rather than the folder. A wrong number stated confidently is
 * the one failure a user can catch instantly, so the shape here separates the
 * two kinds of data explicitly:
 *
 *   COMPLETE  totals, by_extension, stale_count — always true for the whole scan
 *   sample_*  partial lists, named so the model knows never to count them
 *
 * Digests are cached per folder and rebuilt on demand, so asking three
 * questions in a row no longer walks the disk three times.
 */
import { apiGetPreferences, apiSavePreferences } from '@/lib/api'
import type { ScannedFile, UserPaths } from '@/types/electron'

const STALE_AFTER_MS = 10 * 60 * 1000
const YEAR_MS = 365 * 24 * 60 * 60 * 1000
/** Above this, filenames stop being sent and only the aggregates carry answers. */
const FULL_LIST_LIMIT = 600

export interface SlimFile {
  /** Short keys: this is repeated hundreds of times and full names cost ~40% more. */
  n: string
  s: number
  m: string | null
  p: string
}

export interface FolderDigest {
  root: string
  label: string
  scanned_at: number
  // Complete — true for every file in the folder
  total_files: number
  total_bytes: number
  by_extension: Record<string, { count: number; bytes: number }>
  stale_count: number
  empty_count: number
  // Partial
  sample_largest: SlimFile[]
  sample_newest: SlimFile[]
  sample_oldest: SlimFile[]
  all_files: SlimFile[] | null
  all_files_truncated: boolean
  error?: string
}

export interface AgentContext {
  watched_folders: FolderDigest[]
  totals: {
    total_files: number
    total_bytes: number
    by_extension: Record<string, { count: number; bytes: number }>
    folder_count: number
    stale_count: number
  }
  unreadable_folders: { root: string; error: string }[]
  oldest_scan: string | null
  any_stale: boolean
}

// Keyed by root path. Cleared on every auth change — see clearDigests().
const digests = new Map<string, FolderDigest>()
let digestOwner: string | null = null

const slim = (f: ScannedFile): SlimFile => ({
  n: f.name,
  s: f.sizeBytes ?? 0,
  m: f.modifiedAt ? new Date(f.modifiedAt).toISOString().slice(0, 10) : null,
  p: f.absolutePath ?? f.relativePath ?? f.name,
})

export function buildDigest(root: string, label: string, files: ScannedFile[]): FolderDigest {
  const by_extension: Record<string, { count: number; bytes: number }> = {}
  let total_bytes = 0
  let stale_count = 0
  let empty_count = 0
  const cutoff = Date.now() - YEAR_MS

  for (const f of files) {
    const ext = (f.extension || 'none').toLowerCase().replace(/^\./, '') || 'none'
    const size = f.sizeBytes ?? 0
    by_extension[ext] ??= { count: 0, bytes: 0 }
    by_extension[ext].count++
    by_extension[ext].bytes += size
    total_bytes += size
    if (size === 0) empty_count++
    if (f.modifiedAt && f.modifiedAt < cutoff) stale_count++
  }

  const dated = files.filter(f => f.modifiedAt)
  const bySize = [...files].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
  const byDate = [...dated].sort((a, b) => (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0))

  return {
    root,
    label,
    scanned_at: Date.now(),
    total_files: files.length,
    total_bytes,
    by_extension,
    stale_count,
    empty_count,
    sample_largest: bySize.slice(0, 15).map(slim),
    sample_newest: byDate.slice(-10).reverse().map(slim),
    sample_oldest: byDate.slice(0, 10).map(slim),
    all_files: files.length <= FULL_LIST_LIMIT ? files.map(slim) : null,
    all_files_truncated: files.length > FULL_LIST_LIMIT,
  }
}

function emptyDigest(root: string, label: string, error: string): FolderDigest {
  return {
    root, label, scanned_at: Date.now(),
    total_files: 0, total_bytes: 0, by_extension: {},
    stale_count: 0, empty_count: 0,
    sample_largest: [], sample_newest: [], sample_oldest: [],
    all_files: [], all_files_truncated: false,
    error,
  }
}

/**
 * The folders this user asked us to watch, with their real paths.
 *
 * The paths come from Electron rather than being assembled from the account's
 * display name — a profile folder is often not the person's first name, and the
 * guessed path simply did not exist.
 */
/** A readable name for a folder, taken from the last segment of its path. */
export function labelForPath(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

export interface ScopeFolder {
  path: string
  label: string
  /** Whether it appears in the Quick Scan shortcuts. It is scanned either way. */
  inQuickScan: boolean
}

/**
 * The user's scan scope — every folder they added, and nothing else.
 *
 * The old Downloads/Desktop/Documents toggles built paths out of the account's
 * display name (C:\Users\<first word>\Downloads). That is not where most
 * people's folders live, so the app confidently scanned somewhere that did not
 * exist. Scope now comes only from folders the user picked or typed.
 *
 * Anyone who had those toggles on is migrated once, below, so they do not lose
 * their setup on upgrade.
 */
export async function resolveScopeFolders(): Promise<ScopeFolder[]> {
  const prefs = await apiGetPreferences()
  const hidden = new Set((prefs.quick_scan_hidden ?? []).map(p => p.toLowerCase()))

  const seen = new Set<string>()
  const out: ScopeFolder[] = []

  for (const p of prefs.custom_folders ?? []) {
    if (!p) continue
    const key = p.toLowerCase()
    if (seen.has(key)) continue      // a duplicate would be counted twice in the totals
    seen.add(key)
    out.push({ path: p, label: labelForPath(p), inQuickScan: !hidden.has(key) })
  }

  return out
}

/**
 * One-time upgrade for users whose scope came from the old toggles.
 *
 * Resolves the real paths from the OS and writes them into custom_folders, so
 * removing the toggles does not silently empty someone's scan scope.
 * Returns the folders added, if any.
 */
export async function migrateLegacyMonitorFolders(): Promise<string[]> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api?.getUserPaths) return []

  const prefs = await apiGetPreferences()
  if ((prefs.custom_folders ?? []).length > 0) return []      // already using the new model
  if (!prefs.monitor_downloads && !prefs.monitor_desktop && !prefs.monitor_documents) return []

  let paths: UserPaths
  try {
    paths = await api.getUserPaths()
  } catch {
    return []
  }

  const wanted = [
    prefs.monitor_downloads ? paths.downloads : null,
    prefs.monitor_desktop ? paths.desktop : null,
    prefs.monitor_documents ? paths.documents : null,
  ].filter((p): p is string => Boolean(p))

  if (!wanted.length) return []

  await apiSavePreferences({ ...prefs, custom_folders: wanted })
  return wanted
}

/** Back-compat name used by the assistant panel. */
export async function resolveWatchedFolders(): Promise<{ path: string; label: string }[]> {
  return (await resolveScopeFolders()).map(({ path, label }) => ({ path, label }))
}

/** Scan one folder and cache the result. Failures are recorded, not hidden. */
export async function refreshFolder(path: string, label: string): Promise<FolderDigest> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api) return emptyDigest(path, label, 'The desktop app is required to read folders.')

  try {
    const { files } = await api.scanDirectory(path)
    if (!Array.isArray(files)) throw new Error('The scanner returned nothing')
    const d = buildDigest(path, label, files)
    digests.set(path, d)
    return d
  } catch (err) {
    const d = emptyDigest(path, label, err instanceof Error ? err.message : 'Could not read this folder')
    digests.set(path, d)
    return d
  }
}

/**
 * Scan every watched folder once, in the background, after login.
 *
 * Sequential on purpose — parallel scans thrash the disk and make the first
 * few seconds of the app feel frozen.
 */
export async function warmWatchedFolders(userId: string): Promise<void> {
  if (digestOwner !== userId) {
    digests.clear()
    digestOwner = userId
  }
  const folders = await resolveWatchedFolders()
  for (const f of folders) {
    await refreshFolder(f.path, f.label)
  }
}

/** Rescan the folders whose digests have gone stale (or all of them, if forced). */
export async function refreshStale(force = false): Promise<string[]> {
  const folders = await resolveWatchedFolders()
  const touched: string[] = []
  for (const f of folders) {
    const existing = digests.get(f.path)
    const stale = !existing || Date.now() - existing.scanned_at > STALE_AFTER_MS
    if (force || stale) {
      await refreshFolder(f.path, f.label)
      touched.push(f.label)
    }
  }
  return touched
}

/** Match a folder the user named in chat ("scan Downloads") to a watched folder. */
export function resolveWatchedFolder(target: string): { path: string; label: string } | null {
  const t = target.toLowerCase().trim()
  for (const d of digests.values()) {
    if (d.label.toLowerCase() === t || d.root.toLowerCase() === t) return { path: d.root, label: d.label }
  }
  for (const d of digests.values()) {
    if (d.root.toLowerCase().includes(t) || d.label.toLowerCase().includes(t)) {
      return { path: d.root, label: d.label }
    }
  }
  return null
}

function mergeExtensions(folders: FolderDigest[]): Record<string, { count: number; bytes: number }> {
  const merged: Record<string, { count: number; bytes: number }> = {}
  for (const f of folders) {
    for (const [ext, v] of Object.entries(f.by_extension)) {
      merged[ext] ??= { count: 0, bytes: 0 }
      merged[ext].count += v.count
      merged[ext].bytes += v.bytes
    }
  }
  return merged
}

/**
 * Everything the agent is allowed to know, for this user only.
 *
 * Cross-folder totals are computed here rather than left for the model to add
 * up, so "how many images do I have" is answered from a real number.
 */
export function buildAgentContext(userId: string): AgentContext | null {
  if (digestOwner !== userId) return null   // never serve one account's scan to another
  if (digests.size === 0) return null

  const all = [...digests.values()]
  const ok = all.filter(d => !d.error)
  const failed = all.filter(d => d.error)

  const sum = (fn: (d: FolderDigest) => number) => ok.reduce((a, d) => a + fn(d), 0)
  const oldest = ok.length ? Math.min(...ok.map(d => d.scanned_at)) : null

  return {
    watched_folders: ok,
    totals: {
      total_files: sum(d => d.total_files),
      total_bytes: sum(d => d.total_bytes),
      by_extension: mergeExtensions(ok),
      folder_count: ok.length,
      stale_count: sum(d => d.stale_count),
    },
    unreadable_folders: failed.map(d => ({ root: d.root, error: d.error! })),
    oldest_scan: oldest ? new Date(oldest).toISOString() : null,
    any_stale: oldest !== null && Date.now() - oldest > STALE_AFTER_MS,
  }
}

export function hasDigests(): boolean {
  return digests.size > 0
}

/**
 * Drop everything. Must run on login, logout, session expiry and refresh
 * failure — a scan from one account must never be visible to the next.
 */
export function clearDigests(): void {
  digests.clear()
  digestOwner = null
}
