'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function FixedBar({ children }: { children: React.ReactNode }) {
  const el = useRef<HTMLDivElement | null>(null)

  if (!el.current && typeof document !== 'undefined') {
    el.current = document.createElement('div')
  }

  useEffect(() => {
    const node = el.current
    if (!node) return
    document.body.appendChild(node)
    return () => { document.body.removeChild(node) }
  }, [])

  if (!el.current) return null
  return createPortal(children, el.current)
}
