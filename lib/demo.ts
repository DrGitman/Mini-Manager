const DEMO_KEY = 'mm.demo_scans'
export const DEMO_LIMIT = 8

export function getDemoScansUsed(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(DEMO_KEY) || '0', 10)
}

export function incrementDemoScans(): number {
  const next = getDemoScansUsed() + 1
  localStorage.setItem(DEMO_KEY, String(next))
  return next
}

export function isDemoExpired(): boolean {
  return getDemoScansUsed() >= DEMO_LIMIT
}

export function resetDemoScans(): void {
  localStorage.removeItem(DEMO_KEY)
}
