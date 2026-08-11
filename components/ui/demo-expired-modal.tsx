'use client'

import { Download, Sparkles } from 'lucide-react'
import { DEMO_LIMIT } from '@/lib/demo'

interface DemoExpiredModalProps {
  open: boolean
  onClose: () => void
}

export function DemoExpiredModal({ open, onClose }: DemoExpiredModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl text-center">
        {/* Icon */}
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="size-7 text-primary" />
        </div>

        <h2 className="text-xl font-bold text-gray-900">Demo limit reached</h2>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          You&apos;ve used all {DEMO_LIMIT} free demo scans. Get the full desktop app for
          unlimited scans, AI organisation, and complete undo history.
        </p>

        {/* CTAs */}
        <div className="mt-6 flex flex-col gap-2.5">
          <a
            href="#download"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <Download className="size-4" />
            Download Mini Manager — Free
          </a>
          <button
            onClick={onClose}
            className="h-10 w-full rounded-xl text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Maybe later
          </button>
        </div>

        {/* Fine print */}
        <p className="mt-3 text-xs text-gray-400">
          No credit card required &middot; Windows &amp; macOS
        </p>
      </div>
    </div>
  )
}
