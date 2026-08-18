// Empty string = same origin (proxied through Next.js rewrites in dev, direct in prod)
const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

/**
 * Where the backend lives. The Electron main process cannot read
 * NEXT_PUBLIC_* (those are baked into the renderer at build time), so it is
 * handed this value instead of assuming localhost — which is what made Google
 * sign-in fail in the packaged app.
 */
export const API_BASE = BASE

// ─── Token storage ────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('mm.token') ?? sessionStorage.getItem('mm.token')
}

function setToken(token: string): void {
  if (typeof window === 'undefined') return
  // Keep in the same storage where it was originally written
  if (localStorage.getItem('mm.token') !== null) {
    localStorage.setItem('mm.token', token)
  } else {
    sessionStorage.setItem('mm.token', token)
  }
}

// ─── Silent refresh ────────────────────────────────────────────────────────────
// Refresh the token when it has < 30 minutes left (2-hour access tokens).

function tokenExpiresAt(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

let _refreshPromise: Promise<void> | null = null

async function maybeRefresh(): Promise<void> {
  const token = getToken()
  if (!token) return
  const exp = tokenExpiresAt(token)
  if (!exp) return
  const minsLeft = (exp - Date.now()) / 60_000
  if (minsLeft > 30) return  // plenty of time left

  // Only one concurrent refresh
  if (!_refreshPromise) {
    _refreshPromise = fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: AuthResponse | null) => { if (data?.access_token) setToken(data.access_token) })
      .catch(() => {})
      .finally(() => { _refreshPromise = null })
  }
  await _refreshPromise
}

// ─── Expired session handling ─────────────────────────────────────────────────

let _redirectingToLogin = false

/**
 * Clear the dead session and send the user to sign in — once.
 * Guarded because several pollers can 401 in the same tick.
 */
function handleSessionExpired(): void {
  if (typeof window === 'undefined' || _redirectingToLogin) return
  _redirectingToLogin = true
  try {
    localStorage.removeItem('mm.session')
    localStorage.removeItem('mm.token')
    sessionStorage.removeItem('mm.session')
    sessionStorage.removeItem('mm.token')
  } catch {
    // storage unavailable — redirect anyway
  }
  const onAuthPage = /\/(login|signup|forgot-password)/.test(window.location.pathname)
  if (!onAuthPage) window.location.href = '/login?expired=1'
}

// ─── Core request helper ──────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  await maybeRefresh()
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    let msg: string
    try {
      const err = JSON.parse(raw)
      msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)
    } catch {
      // Response is not JSON — likely an HTML proxy error (backend unreachable)
      msg = raw.length > 0
        ? `Backend error (${res.status}): is the API server running on port 8000?`
        : `HTTP ${res.status}: no response body`
    }

    // A dead session used to leave the app polling forever, spamming 401s to
    // both the console and the server and never sending the user anywhere.
    // The refresh endpoint is exempt: its own 401 is what tells us the session
    // is unrecoverable, and handling it here would recurse.
    if (res.status === 401 && !path.includes('/auth/refresh')) {
      handleSessionExpired()
    } else {
      console.error('API error', res.status, path, msg)
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string
  token_type: string
  user_id: string
  email: string
  name: string
  plan: string
}

export async function apiSignup(
  email: string,
  name: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>('/api/v1/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, name, password }),
  })
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

// ─── Classify ─────────────────────────────────────────────────────────────────

export interface FileItem {
  id: string
  name: string
  extension: string
  size: number
  modified_at: number
  relative_path?: string
  content_preview?: string
}

export interface FolderSuggestion {
  original_path: string
  suggested_name: string
  suggested_path: string
  reason: string
  confidence: number
}

export interface ClassificationResult {
  id: string
  category: string
  new_name: string
  target_folder: string
  confidence: number
  reason: string
  source: 'cache' | 'heuristic' | 'ai'
  sensitivity: 'none' | 'personal' | 'financial' | 'identity'
}

export interface ClassifyResponse {
  results: ClassificationResult[]
  folder_suggestions: FolderSuggestion[]
  tokens_used: number
  cache_hits: number
  heuristic_hits: number
  ai_calls: number
}

export async function apiClassify(
  files: FileItem[],
  existingFolders: string[] = [],
  rootFolderName: string = '',
): Promise<ClassifyResponse> {
  return request<ClassifyResponse>('/api/v1/classify', {
    method: 'POST',
    body: JSON.stringify({ files, existing_folders: existingFolders, root_folder_name: rootFolderName }),
  })
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  steps?: AgentStep[]
}

export interface AgentStep {
  label: string
  status: 'pending' | 'active' | 'done' | 'failed' | 'skipped'
  detail?: string
}

export interface AgentQuestion {
  question: string
  options: string[]
  type: 'single_select' | 'multi_select'
}

export interface AgentOperation {
  type: string
  source?: string | null
  destination?: string | null
  path?: string | null
  new_name?: string | null
}

export interface AgentOpResult {
  op: string
  status: 'done' | 'refused' | 'failed'
  detail: string
  /** Present on operations that moved something — used to write the journal. */
  file_name?: string
  from?: string
  to?: string
}

/** True when running inside the packaged desktop app. */
function hasElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.runOperations)
}

/**
 * Ask the agent. In the desktop app the server only *plans* — the operations
 * come back and run locally, because the user's files are on their machine and
 * a hosted backend cannot reach them.
 */
export async function apiAgent(
  messages: { role: string; content: string }[],
  folderContext?: string,
  fileListing?: { folder: string; files: { name: string; ext: string; size_kb: number; path: string }[] }[],
  scanContext?: unknown,
  taskResult?: { summary: string; steps: string[] },
): Promise<{
  reply: string
  steps?: AgentStep[]
  needs_clarification?: boolean
  questions?: AgentQuestion[]
  operations?: AgentOperation[]
  /**
   * True only when operations actually ran on this machine and returned
   * results. The UI binds its "Task complete" chip to this, never to the
   * model's reply — otherwise the model narrating "I'll scan your Downloads
   * folder" renders as a finished task that never happened.
   */
  executed?: boolean
  /** Operations awaiting the user's confirmation. Nothing has run yet. */
  pendingOperations?: AgentOperation[]
}> {
  const clientExecution = hasElectron()

  const res = await request<{
    reply: string
    steps?: AgentStep[]
    needs_clarification?: boolean
    questions?: AgentQuestion[]
    operations?: AgentOperation[]
  }>('/api/v1/agent', {
    method: 'POST',
    body: JSON.stringify({
      messages,
      folder_context: folderContext ?? null,
      file_listing: fileListing ?? null,
      scan_context: scanContext ?? null,
      task_result: taskResult ?? null,
      client_execution: clientExecution,
    }),
  })

  // Operations that change files are never run off the model's say-so. They
  // come back to the panel, which shows exactly what will happen and waits for
  // the user to press Apply — see runAgentOperations below.
  //
  // Previously this branch replaced the reply with "I've prepared these changes
  // but haven't applied them, use the Organize page", and there was no way to
  // apply them anywhere. The assistant could not do anything it was asked.
  if (clientExecution && res.operations?.length) {
    return { ...res, executed: false, pendingOperations: res.operations }
  }

  // No operations came back, so nothing ran. Any steps here are the model
  // describing intent, and the panel renders them as narration only.
  return { ...res, executed: false }
}

/**
 * Run operations the user has confirmed, then record them.
 *
 * Recording is what makes the History and Archive pages real: they read the
 * journal, so work done from the chat panel was invisible there until now —
 * archived files in particular never showed up at all.
 */
export async function runAgentOperations(
  operations: AgentOperation[],
  label = 'Assistant',
): Promise<AgentOpResult[]> {
  if (!hasElectron()) {
    return operations.map(o => ({
      op: o.type, status: 'failed' as const,
      detail: 'File changes need the desktop app.',
    }))
  }

  const results = await window.electronAPI!.runOperations(operations)

  // Journal whatever actually succeeded and touched a real path. A failure or
  // a refusal is not history — it never happened.
  const done = results.filter(r => r.status === 'done' && r.from && r.file_name)
  if (done.length) {
    try {
      await request('/api/v1/batches', {
        method: 'POST',
        body: JSON.stringify({
          label,
          folder_path: '',
          ops: done.map(r => ({
            file_name: r.file_name,
            from_location: r.from,
            to_location: r.to ?? '',
            op_type: r.op,
          })),
        }),
      })
    } catch (err) {
      // The files did move — losing the journal entry must not read as failure.
      console.error('[agent] operations ran but could not be recorded', err)
    }
  }

  return results
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface ApiNotification {
  id: string
  kind: 'scan' | 'apply' | 'undo' | 'tip' | 'system' | 'agent'
  title: string
  body: string
  read: boolean
  created_at: string
}

export async function apiGetNotifications(): Promise<{ notifications: ApiNotification[]; unread_count: number }> {
  return request('/api/v1/notifications')
}

export async function apiToggleRead(id: string): Promise<void> {
  return request(`/api/v1/notifications/${id}/read`, { method: 'PATCH' })
}

export async function apiMarkAllRead(): Promise<void> {
  return request('/api/v1/notifications/read-all', { method: 'PATCH' })
}

export async function apiDeleteNotification(id: string): Promise<void> {
  return request(`/api/v1/notifications/${id}`, { method: 'DELETE' })
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  total_files_scanned: number
  total_scans: number
  ready_to_organise: number
  proposals: { auto: number; review: number; manual: number }
  recent_scans: {
    id: string
    folder_path: string
    file_count: number
    created_at: string
    proposal_count: number
  }[]
  top_files: { name: string; size_bytes: number; category: string }[]
}

export async function apiGetStats(): Promise<DashboardStats> {
  return request<DashboardStats>('/api/v1/stats')
}

// ─── Preferences ──────────────────────────────────────────────────────────────

export interface Preferences {
  // Legacy fields
  naming_style: string
  categories: string[]
  target_folder: string
  quarantine_mode: string
  // Extended fields
  naming_convention: string
  auto_threshold: number
  review_threshold: number
  /**
   * Superseded by custom_folders. These assumed a home directory built from
   * the account's display name, which is usually not where the folders are.
   * Kept only so old saved preferences still load.
   */
  monitor_downloads: boolean
  monitor_desktop: boolean
  monitor_documents: boolean
  /** Every folder in the scan scope. The only source of what gets scanned. */
  custom_folders: string[]
  /** Folders excluded from the Quick Scan shortcuts — still scanned. */
  quick_scan_hidden: string[]
  notif_scan: boolean
  notif_apply: boolean
  notif_digest: boolean
  notif_tips: boolean
  notif_marketing: boolean
  theme: string
}

export async function apiGetPreferences(): Promise<Preferences> {
  return request<Preferences>('/api/v1/preferences')
}

export async function apiSavePreferences(prefs: Preferences): Promise<Preferences> {
  return request<Preferences>('/api/v1/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  })
}

// ─── Corrections ─────────────────────────────────────────────────────────────

export async function apiLogCorrection(
  pattern: string,
  proposed: string,
  corrected: string,
  field: 'target_folder' | 'new_name' | 'rejected' = 'target_folder',
): Promise<void> {
  await request('/api/v1/corrections', {
    method: 'POST',
    body: JSON.stringify({ pattern, proposed, corrected, field }),
  })
}

export async function apiMarkApplied(
  entries: { fingerprint: string; applied_path: string }[],
): Promise<void> {
  await request('/api/v1/applied', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  })
}

// ─── Scans ────────────────────────────────────────────────────────────────────

export async function apiSaveScan(
  folderPath: string,
  fileCount: number,
  proposals: object[],
): Promise<void> {
  await request('/api/v1/scans', {
    method: 'POST',
    body: JSON.stringify({ folder_path: folderPath, file_count: fileCount, proposals }),
  })
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export interface Rule {
  id: string
  natural_text: string
  target_folder: string
  match_extensions: string[]
  match_name_contains: string[]
  older_than_days: number | null
  larger_than_mb: number | null
  enabled: boolean
  created_at: string
}

export interface CompiledRule {
  target_folder: string
  match_extensions: string[]
  match_name_contains: string[]
  older_than_days: number | null
  larger_than_mb: number | null
  preview: string
  corrected_input?: string | null
}

export async function apiGetRules(): Promise<Rule[]> {
  return request<Rule[]>('/api/v1/rules')
}

export async function apiCreateRule(data: {
  natural_text: string
  target_folder: string
  match_extensions: string[]
  match_name_contains: string[]
  older_than_days?: number | null
  larger_than_mb?: number | null
}): Promise<Rule> {
  return request<Rule>('/api/v1/rules', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiToggleRule(id: string): Promise<Rule> {
  return request<Rule>(`/api/v1/rules/${id}/toggle`, { method: 'PATCH' })
}

export async function apiDeleteRule(id: string): Promise<void> {
  return request(`/api/v1/rules/${id}`, { method: 'DELETE' })
}

export async function apiCompileRule(text: string): Promise<CompiledRule> {
  return request<CompiledRule>('/api/v1/rules/compile', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface ProfileData {
  user_id: string
  email: string
  name: string
  plan: string
  company: string | null
  location: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string | null
}

export async function apiGetProfile(): Promise<ProfileData> {
  return request<ProfileData>('/api/v1/profile')
}

/** PATCH semantics — only the keys you pass are changed. Pass null to clear. */
export async function apiUpdateProfile(data: {
  name?: string
  company?: string | null
  location?: string | null
  bio?: string | null
  avatar_url?: string | null
}): Promise<ProfileData> {
  return request<ProfileData>('/api/v1/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function apiChangePassword(oldPassword: string, newPassword: string): Promise<void> {
  return request('/api/v1/profile/password', {
    method: 'POST',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  })
}

/** Revokes every token for this user — including the caller's own. */
export async function apiSignOutAllDevices(): Promise<void> {
  return request('/api/v1/profile/sign-out-all', { method: 'POST' })
}

/** Permanently deletes the account. Requires the current password. */
export async function apiDeleteAccount(password: string): Promise<void> {
  return request('/api/v1/profile', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  })
}

// ─── Explain ──────────────────────────────────────────────────────────────────

export interface ExplainResult {
  summary: string
  suggested_category: string
  suggested_name: string
  suggested_folder: string
  confidence: number
  tokens_used: number
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export interface DuplicatePair {
  id: string
  fileA: { name: string; size: number; ext: string; scan_date: string }
  fileB: { name: string; size: number; ext: string; scan_date: string }
  similarity: 'exact-size' | 'name-variant'
}

export interface StaleFile {
  id: string
  name: string
  size: number
  extension: string
  modified_at: number
  days_unchanged: number
  category: string
}

export interface InsightsData {
  duplicates: DuplicatePair[]
  stale_files: StaleFile[]
  total_size_bytes: number
  duplicate_size_bytes: number
  stale_size_bytes: number
}

export async function apiGetInsights(): Promise<InsightsData> {
  return request<InsightsData>('/api/v1/insights')
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchFile {
  name: string
  suggested_name: string
  category: string
  target_folder: string
  size_bytes: number
}

export interface SearchFolder {
  path: string
  file_count: number
}

export interface SearchResponse {
  files: SearchFile[]
  folders: SearchFolder[]
}

export async function apiSearch(q: string): Promise<SearchResponse> {
  return request<SearchResponse>(`/api/v1/search?q=${encodeURIComponent(q)}`)
}

// ─── Journal ──────────────────────────────────────────────────────────────────

export interface ApiBatch {
  id: string
  label: string
  folder_path: string
  op_count: number
  status: string
  created_at: string
}

export interface ApiFileOp {
  id: string
  file_name: string
  from_location: string
  to_location: string
  op_type: string
  skipped: boolean
  created_at: string
}

export interface ApiUndoResult {
  batch_id: string
  undo_batch_id: string
  reversed: number
  skipped: number
  status: string
}

export interface ApiArchivedFile {
  op_id: string
  file_name: string
  original_path: string
  archive_path: string
  archived_at: string
}

export async function apiGetBatches(): Promise<ApiBatch[]> {
  return request<ApiBatch[]>('/api/v1/batches')
}

export async function apiGetBatchOps(batchId: string): Promise<ApiFileOp[]> {
  return request<ApiFileOp[]>(`/api/v1/batches/${batchId}/ops`)
}

export async function apiUndoBatch(batchId: string): Promise<ApiUndoResult> {
  return request<ApiUndoResult>(`/api/v1/batches/${batchId}/undo`, { method: 'POST' })
}

export async function apiGetArchive(): Promise<ApiArchivedFile[]> {
  return request<ApiArchivedFile[]>('/api/v1/archive')
}

export async function apiRestoreFile(opId: string): Promise<void> {
  return request(`/api/v1/archive/${opId}/restore`, { method: 'POST' })
}

export async function apiUndoSingleOp(opId: string): Promise<void> {
  return request(`/api/v1/file_ops/${opId}/undo`, { method: 'POST' })
}

export async function apiDeleteArchivedFile(opId: string): Promise<void> {
  return request(`/api/v1/archive/${opId}`, { method: 'DELETE' })
}

// ─── Blocklist ────────────────────────────────────────────────────────────────

export interface BlocklistEntry {
  id: string
  path: string
  reason: string | null
  created_at: string
}

export async function apiGetBlocklist(): Promise<BlocklistEntry[]> {
  return request<BlocklistEntry[]>('/api/v1/blocklist')
}

export async function apiAddBlocklist(path: string, reason?: string): Promise<BlocklistEntry> {
  return request<BlocklistEntry>('/api/v1/blocklist', {
    method: 'POST',
    body: JSON.stringify({ path, reason: reason ?? null }),
  })
}

export async function apiDeleteBlocklist(id: string): Promise<void> {
  return request(`/api/v1/blocklist/${id}`, { method: 'DELETE' })
}

// ─── Conventions ──────────────────────────────────────────────────────────────

export interface Convention {
  id: string
  scope: string
  rule_text: string
  compiled: Record<string, unknown> | null
  source: string
  active: boolean
}

export async function apiGetConventions(): Promise<Convention[]> {
  return request<Convention[]>('/api/v1/conventions')
}

export async function apiAddConvention(rule_text: string, scope?: string): Promise<Convention> {
  return request<Convention>('/api/v1/conventions', {
    method: 'POST',
    body: JSON.stringify({ rule_text, scope: scope ?? 'global' }),
  })
}

export async function apiToggleConvention(id: string): Promise<Convention> {
  return request<Convention>(`/api/v1/conventions/${id}/toggle`, { method: 'PATCH' })
}

export async function apiDeleteConvention(id: string): Promise<void> {
  return request(`/api/v1/conventions/${id}`, { method: 'DELETE' })
}

// ─── Support ──────────────────────────────────────────────────────────────────

export interface SupportResponse {
  reply: string
  escalated: boolean
  ticket_id: string
  category: string
}

export async function apiSupportChat(message: string, email?: string, subject?: string): Promise<SupportResponse> {
  return request<SupportResponse>('/api/v1/support/chat', {
    method: 'POST',
    body: JSON.stringify({ message, email: email ?? null, subject: subject ?? null }),
  })
}

export async function apiGetSupportTickets(): Promise<object[]> {
  return request<object[]>('/api/v1/support/tickets')
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export interface OnboardResponse {
  naming_style: string
  structure_style: string
  detected_conventions: { rule_text: string; confidence: number }[]
  summary: string
  conventions_saved: number
}

export async function apiOnboardingAnalyze(fileNames: string[], folderPaths: string[]): Promise<OnboardResponse> {
  return request<OnboardResponse>('/api/v1/onboarding/analyze', {
    method: 'POST',
    body: JSON.stringify({ file_names: fileNames, folder_paths: folderPaths }),
  })
}

// ─── Explain ──────────────────────────────────────────────────────────────────

export async function apiExplain(
  filename: string,
  extension: string,
  size: number,
  contentPreview?: string,
): Promise<ExplainResult> {
  return request<ExplainResult>('/api/v1/explain', {
    method: 'POST',
    body: JSON.stringify({
      filename,
      extension,
      size,
      content_preview: contentPreview ?? null,
    }),
  })
}
