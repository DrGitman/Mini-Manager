'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * Returns to wherever the visitor came from — checkout, upgrade, signup — rather
 * than always dumping them on /login. Falls back to /login on a cold entry
 * (opened in a new tab, followed from an email) where there's no history to pop.
 */
export function LegalBackButton() {
  const router = useRouter()

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/login')
    }
  }

  return (
    <button
      onClick={handleBack}
      className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft size={15} />
      Back
    </button>
  )
}
