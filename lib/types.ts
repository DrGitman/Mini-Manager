export interface FileMeta {
  id: string
  name: string
  extension: string
  relativePath: string
  sizeBytes: number
  modifiedAt: number
  createdAt?: number
}

export type ConfidenceBucket = 'auto' | 'review' | 'input'

export interface Proposal {
  id: string
  file: FileMeta
  targetFolder: string
  newName: string
  category: string
  reason: string
  confidence: number
  bucket: ConfidenceBucket
  selected: boolean
  source: 'heuristic' | 'ai' | 'rule'
  sensitivity: 'none' | 'personal' | 'financial' | 'identity'
}

export interface JournalOperation {
  id: string
  batchId: string
  seq: number
  fromPath: string
  toPath: string
  oldName: string
  newName: string
  status: 'pending' | 'done' | 'undone' | 'failed'
}

export interface JournalBatch {
  id: string
  rootLabel: string
  createdAt: number
  opCount: number
  status: 'applied' | 'undone' | 'partial'
  mode: 'demo' | 'fs'
}

export interface OrganizeRule {
  id: string
  naturalText: string
  match: {
    extensions?: string[]
    nameContains?: string[]
    olderThanDays?: number
    largerThanMB?: number
  }
  action: {
    targetFolder: string
    renamePattern?: string
  }
  enabled: boolean
  createdAt: number
}

export interface AppNotification {
  id: string
  title: string
  body: string
  kind: 'scan' | 'apply' | 'undo' | 'system' | 'tip'
  read: boolean
  createdAt: number
}

export interface UserPreferences {
  namingConvention: 'date-subject' | 'subject-date' | 'keep-clean'
  autoApplyThreshold: number
  reviewThreshold: number
  monitorDownloads: boolean
  monitorDesktop: boolean
  monitorDocuments: boolean
  theme: 'light' | 'dark' | 'system'
  onboardingComplete: boolean
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  namingConvention: 'date-subject',
  autoApplyThreshold: 0.85,
  reviewThreshold: 0.7,
  monitorDownloads: true,
  monitorDesktop: false,
  monitorDocuments: false,
  theme: 'light',
  onboardingComplete: false,
}

export interface DemoUser {
  name: string
  email: string
  avatarInitials: string
  /** data: URL of the uploaded profile photo; falls back to initials when absent. */
  avatarUrl?: string | null
  plan: 'free' | 'pro'
  joinedAt: number
}

export function bucketFor(
  confidence: number,
  prefs?: Pick<UserPreferences, 'autoApplyThreshold' | 'reviewThreshold'>,
): ConfidenceBucket {
  const auto = prefs?.autoApplyThreshold ?? 0.85
  const review = prefs?.reviewThreshold ?? 0.7
  if (confidence >= auto) return 'auto'
  if (confidence >= review) return 'review'
  return 'input'
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(ts).toLocaleDateString()
}
