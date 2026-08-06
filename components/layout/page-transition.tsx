'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const prevPath = useRef(pathname)

  useEffect(() => {
    if (prevPath.current === pathname) return
    prevPath.current = pathname
    setVisible(false)
    const t = setTimeout(() => setVisible(true), 60)
    return () => clearTimeout(t)
  }, [pathname])

  return (
    <div
      className="h-full w-full"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 220ms ease, transform 220ms ease',
      }}
    >
      {children}
    </div>
  )
}
