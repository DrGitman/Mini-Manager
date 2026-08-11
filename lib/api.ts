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
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    const msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)
    console.error('API error', res.status, msg)
    throw new Error(msg ?? `HTTP ${res.status}`)
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

// ─── Scans ────────────────────────────────────────────────────────────────────

// ─── Preferences ──────────────────────────────────────────────────────────────

export interface Preferences {
  naming_style: string
  categories: string[]
  target_folder: string
  quarantine_mode: string
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
