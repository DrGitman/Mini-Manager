'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { saveSession } from '@/lib/session'
import type { DemoUser } from '@/lib/types'

function GoogleCallback() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const token   = params.get('token')
    const email   = params.get('email')
    const name    = params.get('name')
    const plan    = params.get('plan')

    if (token && email && name) {
      const initials = name.split(' ').slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')
      saveSession(
        {
          name,
          email,
          avatarInitials: initials,
          plan: (plan ?? 'free') as DemoUser['plan'],
          joinedAt: Date.now(),
        },
        token,
        true, // remember me — Google users expect to stay logged in
      )
      router.replace('/organize')
    } else {
      router.replace('/login?error=google_failed')
    }
  }, [params, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-500">Signing you in with Google…</p>
    </div>
  )
}

// useSearchParams needs a Suspense boundary, otherwise the production build
// fails to prerender this route and the whole deploy aborts.
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-gray-500">Signing you in with Google…</p>
        </div>
      }
    >
      <GoogleCallback />
    </Suspense>
  )
}
