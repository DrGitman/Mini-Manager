'use client'

import { useSyncExternalStore } from 'react'
import type { DemoUser } from './types'

const SESSION_KEY = 'mm.session'
const TOKEN_KEY   = 'mm.token'

// ─── Change notification ──────────────────────────────────────────────────────
// The app shell holds the session in React state and passes it to the sidebar
// and top bar. Without this, writing a new avatar or name from the profile page
// updates storage but nothing re-renders until a full page reload.

// The event travels on `window` rather than a module-level Set on purpose:
// Next.js Fast Refresh re-evaluates this module, which would leave subscribers
// attached to the previous module instance's Set while writers notify the new
// one. `window` is shared across instances, so the two can never desync.
const SESSION_EVENT = 'mm:session-change'

type Listener = () => void

function emitSessionChange(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SESSION_EVENT))
}

/** Subscribe to session changes in this tab, and to writes from other tabs. */
export function subscribeToSession(onChange: Listener): () => void {
  if (typeof window === 'undefined') return () => {}
  // Same tab.
  window.addEventListener(SESSION_EVENT, onChange)
  // Other tabs — `storage` only fires on the tabs that did NOT write.
  const onStorage = (e: StorageEvent) => {
    if (e.key === SESSION_KEY || e.key === null) onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(SESSION_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

// useSyncExternalStore requires a referentially stable snapshot, so cache the
// parsed object and only re-parse when the underlying string actually changes.
let _cachedRaw: string | null = null
let _cachedUser: DemoUser | null = null

function readRaw(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY)
}

function getSessionSnapshot(): DemoUser | null {
  const raw = readRaw()
  if (raw !== _cachedRaw) {
    _cachedRaw = raw
    try {
      _cachedUser = raw ? (JSON.parse(raw) as DemoUser) : null
    } catch {
      _cachedUser = null
    }
  }
  return _cachedUser
}

/** Live session — re-renders whenever the session is written anywhere. */
export function useSession(): DemoUser | null {
  return useSyncExternalStore(subscribeToSession, getSessionSnapshot, () => null)
}

// ─── Read / write ─────────────────────────────────────────────────────────────

export function getSession(): DemoUser | null {
  if (typeof window === 'undefined') return null
  return getSessionSnapshot()
}

/** Which store currently holds the session — set by the "Remember me" choice. */
function activeStore(): Storage {
  return localStorage.getItem(SESSION_KEY) !== null ? localStorage : sessionStorage
}

export function saveSession(user: DemoUser, token: string, remember = true): void {
  const store = remember ? localStorage : sessionStorage
  store.setItem(SESSION_KEY, JSON.stringify(user))
  store.setItem(TOKEN_KEY, token)
  emitSessionChange()
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
}

export function updateUser(patch: Partial<DemoUser>): DemoUser | null {
  const current = getSession()
  if (!current) return null
  const next = { ...current, ...patch }
  if (patch.name) {
    next.avatarInitials = patch.name
      .split(' ')
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('')
  }
  // Write back to whichever store already holds the session. Always using
  // localStorage here would persist the profile of someone who deliberately
  // signed in without "Remember me".
  activeStore().setItem(SESSION_KEY, JSON.stringify(next))
  emitSessionChange()
  return next
}

export function signOut(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  emitSessionChange()
}
