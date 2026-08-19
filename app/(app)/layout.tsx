'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { TopBar } from '@/components/layout/top-bar'
import { AiPanel } from '@/components/layout/ai-panel'
import { PageTransition } from '@/components/layout/page-transition'
import { Skeleton } from '@/components/ui/skeleton'
import { getSession, useSession, updateUser } from '@/lib/session'
import { startScheduler } from '@/lib/scheduler'
import { PreferencesProvider } from '@/lib/preferences-context'
import { apiGetNotifications, apiGetProfile } from '@/lib/api'
import type { DemoUser } from '@/lib/types'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  // Live session — updates as soon as the profile page writes a new name/photo.
  const user = useSession()
  const [checking, setChecking] = useState(true)
  const [aiOpen, setAiOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // The autonomous scheduler. Asks the server whether a run is owed, on launch
  // and periodically — launch being what catches a machine that was switched
  // off. Desktop only: the server cannot read the user's disk, so only the
  // device can supply the folder digests a run needs.
  useEffect(() => {
    if (!getSession()) return
    return startScheduler()
  }, [user?.email])

  useEffect(() => {
    if (!getSession()) {
      router.replace('/login')
      return
    }
    setChecking(false)

    // The session is written at login from the auth response, which carries no
    // photo. Pull the server profile once so the avatar and plan are correct
    // everywhere without waiting for a visit to the profile page.
    apiGetProfile()
      .then(p =>
        updateUser({
          name: p.name,
          avatarUrl: p.avatar_url ?? null,
          plan: p.plan as DemoUser['plan'],
        }),
      )
      .catch(() => {})

    // Fetch real unread count
    apiGetNotifications()
      .then(res => setUnreadCount(res.unread_count))
      .catch(() => {})

    // Refresh badge every 60s
    const interval = setInterval(() => {
      apiGetNotifications()
        .then(res => setUnreadCount(res.unread_count))
        .catch(() => {})
    }, 60_000)
    return () => clearInterval(interval)
  }, [router])

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
    )
  }

  return (
    <PreferencesProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar user={user} unreadCount={unreadCount} />

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden border-l border-border">
        <TopBar unreadCount={unreadCount} user={user} aiOpen={aiOpen} onAiToggle={() => setAiOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto bg-background p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      {/* AI slide-in panel */}
      <div
        className={`fixed right-0 top-0 h-full z-40 transition-transform duration-300 ease-in-out ${
          aiOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <AiPanel onClose={() => setAiOpen(false)} />
      </div>

      {/* Backdrop */}
      {aiOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
          onClick={() => setAiOpen(false)}
        />
      )}
    </div>
    </PreferencesProvider>
  )
}
