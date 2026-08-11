// Empty string = same origin (proxied through Next.js rewrites in dev, direct in prod)
const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('mm.token') ?? sessionStorage.getItem('mm.token')
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
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
        ? `Backend error (${res.status}) — is the API server running on port 8000?`
        : `HTTP ${res.status} — no response body`
    }
    console.error('API error', res.status, path, msg)
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
}

export interface ClassificationResult {
  id: string
  category: string
  new_name: string
  target_folder: string
  confidence: number
  reason: string
  source: 'cache' | 'heuristic' | 'ai'
}

export interface ClassifyResponse {
  results: ClassificationResult[]
  tokens_used: number
  cache_hits: number
  heuristic_hits: number
  ai_calls: number
}

export async function apiClassify(
  files: FileItem[],
  existingFolders: string[] = [],
): Promise<ClassifyResponse> {
  return request<ClassifyResponse>('/api/v1/classify', {
    method: 'POST',
    body: JSON.stringify({ files, existing_folders: existingFolders }),
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

export async function apiAgent(
  messages: { role: string; content: string }[],
  folderContext?: string,
): Promise<{ reply: string; steps?: AgentStep[]; needs_clarification?: boolean; questions?: AgentQuestion[] }> {
  return request('/api/v1/agent', {
    method: 'POST',
    body: JSON.stringify({ messages, folder_context: folderContext }),
  })
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
  monitor_downloads: boolean
  monitor_desktop: boolean
  monitor_documents: boolean
  custom_folders: string[]
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
}

export async function apiGetProfile(): Promise<ProfileData> {
  return request<ProfileData>('/api/v1/profile')
}

export async function apiUpdateProfile(data: {
  name: string
  company?: string | null
  location?: string | null
  bio?: string | null
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
