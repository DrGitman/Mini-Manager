'use client'

/**
 * The demo's front door.
 *
 * This page holds no UI of its own beyond a spinner. It mints a guest token,
 * writes it as a normal session, and sends the visitor into the real app.
 * Everything they see after this is the shipping product — the same Organize
 * screen, the same components, the same code paths — not a preview built to
 * look like it.
 *
 * That matters for a reason beyond honesty: a hand-built copy of the app would
 * drift from the app the first time either changed, and the version a judge
 * looked at would quietly stop being the version that exists.
 *
 * It sits outside the `(app)` route group because that group's layout bounces
 * anyone without a session to /login, and there is no session until this page
 * has run.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { saveSession } from '@/lib/session'
import { startDemoSession, markDemoSession } from '@/lib/demo-session'

const REPO = 'https://github.com/DrGitman/Mini-Manager'

export default function DemoEntry() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [slow, setSlow] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    // React 18 mounts effects twice in development. Minting two guest sessions
    // on every visit would burn through the per-IP budget at twice the rate.
    if (started.current) return
    started.current = true

    // Render's free tier sleeps and takes up to a minute to wake. A bare
    // spinner reads as broken at that length, and the person waiting is a judge
    // deciding whether to bother.
    const slowTimer = setTimeout(() => setSlow(true), 4000)

    startDemoSession()
      .then(session => {
        // Written as an ordinary session on purpose: every existing screen,
        // guard and API call then works untouched. `remember = false` keeps it
        // in sessionStorage, so closing the tab ends the demo and it can never
        // outlive the visit or overwrite a real login on a shared machine.
        saveSession(
          {
            name: 'Guest',
            email: 'guest@demo',
            avatarInitials: 'G',
            plan: 'free',
            joinedAt: Date.now(),
          },
          session.token,
          false,
        )
        markDemoSession()
        router.replace('/organize')
      })
      .catch(e => setError(e.message))
      .finally(() => clearTimeout(slowTimer))

    return () => clearTimeout(slowTimer)
  }, [router])

  if (error) {
    return (
      <main className="dark flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <AlertCircle className="size-5 text-amber-500" />
          <p className="mt-3 text-[15px] leading-relaxed text-foreground">{error}</p>
          <div className="mt-4 flex flex-wrap gap-4">
            <a href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Back to the site
            </a>
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Read the code on GitHub <ArrowRight className="size-3.5" />
            </a>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="dark flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-[15px] text-foreground">Opening Mini Manager…</p>
      {slow && (
        <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          The server sleeps when nobody is using it and takes up to a minute to wake.
          This only happens on the first visit.
        </p>
      )}
    </main>
  )
}
