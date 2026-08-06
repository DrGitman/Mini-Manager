'use client'

import { useEffect, useState } from 'react'

const COLORS = ['#4357D4', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316']
const COUNT = 48

interface Piece {
  id: number
  left: number
  color: string
  size: number
  delay: number
  duration: number
  shape: 'circle' | 'rect'
  drift: number
}

export function ConfettiBurst({ onDone }: { onDone?: () => void }) {
  const [pieces] = useState<Piece[]>(() =>
    Array.from({ length: COUNT }, (_, i) => ({
      id: i,
      left: 5 + Math.random() * 90,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 7,
      delay: Math.random() * 0.5,
      duration: 1.4 + Math.random() * 0.8,
      shape: Math.random() > 0.5 ? 'circle' : 'rect',
      drift: (Math.random() - 0.5) * 60,
    }))
  )
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false)
      onDone?.()
    }, 2800)
    return () => clearTimeout(t)
  }, [onDone])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden" aria-hidden>
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '20%',
            left: `${p.left}%`,
            width: p.size,
            height: p.shape === 'circle' ? p.size : p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '2px',
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s both, confetti-drift ${p.duration}s ease-in-out ${p.delay}s both`,
            marginLeft: p.drift,
          }}
        />
      ))}
    </div>
  )
}
