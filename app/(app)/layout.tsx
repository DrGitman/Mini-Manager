'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { TopBar } from '@/components/layout/top-bar'
import { AiPanel } from '@/components/layout/ai-panel'
import { PageTransition } from '@/components/layout/page-transition'
import { Skeleton } from '@/components/ui/skeleton'
import { getSession } from '@/lib/session'
import type { DemoUser } from '@/lib/types'

const UNREAD_COUNT = 3

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<DemoUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [aiOpen, setAiOpen] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    setUser(session)
    setChecking(false)
  }, [router])

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <Sidebar user={user} unreadCount={UNREAD_COUNT} />

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden border-l border-gray-100">
        <TopBar unreadCount={UNREAD_COUNT} user={user} aiOpen={aiOpen} onAiToggle={() => setAiOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto bg-[#f4f6fb] p-6">
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
  )
}
