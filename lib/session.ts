'use client'

import type { DemoUser } from './types'

const SESSION_KEY = 'mm.session'
const TOKEN_KEY   = 'mm.token'

export function getSession(): DemoUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as DemoUser) : null
  } catch {
    return null
  }
}

export function saveSession(user: DemoUser, token: string, remember = true): void {
  const store = remember ? localStorage : sessionStorage
  store.setItem(SESSION_KEY, JSON.stringify(user))
  store.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
}

/** Legacy helper kept for compatibility — use saveSession for real auth */
export function signIn(email: string, name?: string): DemoUser {
  const cleanName =
    name?.trim() ||
    email
      .split('@')[0]
      .split(/[.\-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  const initials = cleanName
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
  const user: DemoUser = {
    name: cleanName,
    email,
    avatarInitials: initials || 'U',
    plan: 'free',
    joinedAt: Date.now(),
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return user
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
  localStorage.setItem(SESSION_KEY, JSON.stringify(next))
  return next
}

export function signOut(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
}
