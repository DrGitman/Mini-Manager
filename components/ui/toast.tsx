'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose: () => void
}

export function Toast({ message, type = 'success', duration = 3500, onClose }: ToastProps) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setLeaving(true)
      setTimeout(onClose, 220)
    }, duration)
    return () => clearTimeout(t)
  }, [duration, onClose])

  function dismiss() {
    setLeaving(true)
    setTimeout(onClose, 220)
  }

  const icons = {
    success: <CheckCircle2 size={16} className="shrink-0 text-green-500" />,
    error:   <XCircle     size={16} className="shrink-0 text-red-500" />,
    info:    <Info        size={16} className="shrink-0 text-blue-500" />,
  }

  const borders = {
    success: 'border-green-100',
    error:   'border-red-100',
    info:    'border-blue-100',
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-xl ${borders[type]} ${leaving ? 'animate-toast-out' : 'animate-toast-in'}`}
    >
      {icons[type]}
      <span className="text-sm font-medium text-gray-800">{message}</span>
      <button
        onClick={dismiss}
        className="ml-2 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <X size={13} />
      </button>
    </div>
  )
}

/* ── Hook for easy usage ─────────────────────────────────── */
import { useCallback } from 'react'
import { useReducer } from 'react'

interface ToastState { id: number; message: string; type: ToastType }
type ToastAction =
  | { type: 'ADD'; payload: ToastState }
  | { type: 'REMOVE'; id: number }

function reducer(state: ToastState[], action: ToastAction): ToastState[] {
  if (action.type === 'ADD') return [...state, action.payload]
  if (action.type === 'REMOVE') return state.filter(t => t.id !== action.id)
  return state
}

let nextId = 0

export function useToast() {
  const [toasts, dispatch] = useReducer(reducer, [])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId
    dispatch({ type: 'ADD', payload: { id, message, type } })
  }, [])

  function ToastContainer() {
    return (
      <>
        {toasts.map(t => (
          <Toast
            key={t.id}
            message={t.message}
            type={t.type}
            onClose={() => dispatch({ type: 'REMOVE', id: t.id })}
          />
        ))}
      </>
    )
  }

  return { toast, ToastContainer }
}
