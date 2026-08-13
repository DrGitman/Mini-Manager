'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { saveSession } from '@/lib/session'

export default function GoogleCallbackPage() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const token   = params.get('token')
    const userId  = params.get('user_id')
    const email   = params.get('email')
    const name    = params.get('name')
    const plan    = params.get('plan')

    if (token && email && name) {
      const initials = name.split(' ').slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')
      saveSession(
        { name, email, avatarInitials: initials, plan: (plan ?? 'free') as 'free' | 'pro', joinedAt: Date.now() },
        token,
        true, // remember me — Google users expect to stay logged in
      )
      router.replace('/organize')
    } else {
      router.replace('/login?error=google_failed')
    }
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-gray-500">Signing you in with Google…</p>
    </div>
  )
}
