'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { saveSession } from '@/lib/session'
import { apiSignup, API_BASE } from '@/lib/api'

const eAPI = typeof window !== 'undefined' ? window.electronAPI : undefined
const isElectron = Boolean(eAPI?.isElectron)

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [shaking, setShaking] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Desktop OAuth comes back through the minimanager:// protocol handler.
  useEffect(() => {
    if (!isElectron || !eAPI) return
    eAPI.onGoogleAuthSuccess((data: Record<string, string>) => {
      setGoogleLoading(false)
      if (!data.token) {
        setErrors(prev => ({ ...prev, form: data.message || 'Google sign-up failed.' }))
        return
      }
      const initials = (data.name || data.email)
        .split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
      saveSession(
        {
          name: data.name,
          email: data.email,
          avatarInitials: initials,
          plan: (data.plan as 'free' | 'pro' | 'business') ?? 'free',
          joinedAt: Date.now(),
        },
        data.token,
        true,
      )
      router.push('/onboarding')
    })
    return () => eAPI.removeGoogleAuthListener?.()
  }, [router])

  /** Sign up with Google. This is the only path allowed to create an account. */
  async function handleGoogleSignup() {
    if (isElectron && eAPI) {
      setGoogleLoading(true)
      await eAPI.googleAuthStart({ intent: 'signup', apiBase: API_BASE })
    } else {
      window.location.href = `${API_BASE}/api/v1/auth/google?mode=web&intent=signup`
    }
  }

  function validate() {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Full name is required.'
    if (!email.trim()) next.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email.'
    if (!password) next.password = 'Password is required.'
    else if (password.length < 8) next.password = 'Password must be at least 8 characters.'
    if (!agreed) next.agreed = 'You must accept the terms to continue.'
    return next
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      const res = await apiSignup(email, name, password)
      const initials = res.name.split(' ').slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')
      saveSession(
        { name: res.name, email: res.email, avatarInitials: initials, plan: res.plan as 'free' | 'pro' | 'business', joinedAt: Date.now() },
        res.access_token,
      )
      router.push('/onboarding')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setErrors({ form: msg })
      setLoading(false)
    }
  }

  return (
    <div className={`w-full max-w-[360px] animate-page-in ${shaking ? 'animate-shake' : ''}`}>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">Create your account</h1>
      <p className="mb-7 text-sm text-gray-500">Try Mini Manager today.</p>

      {errors.form && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {errors.form}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4 stagger">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-sm font-medium text-gray-700">Full name</Label>
          <Input
            id="name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="name"
            className={`auth-input h-11 w-full rounded-lg border bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 ${errors.name ? 'border-red-400 animate-red-glow' : 'border-gray-300'}`}
          />
          {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            className={`auth-input h-11 w-full rounded-lg border bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 ${errors.email ? 'border-red-400 animate-red-glow' : 'border-gray-300'}`}
          />
          {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              className={`auth-input h-11 w-full rounded-lg border bg-white px-3 pr-10 text-sm text-gray-900 placeholder:text-gray-400 ${errors.password ? 'border-red-400 animate-red-glow' : 'border-gray-300'}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
        </div>

        <div className="space-y-1">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-600">
            <Checkbox
              checked={agreed}
              onCheckedChange={v => setAgreed(v === true)}
              className="mt-0.5"
            />
            <span>
              I agree to the{' '}
              <Link href="/terms" className="font-medium text-primary hover:underline">Terms of Service</Link>
              {' '}and{' '}
              <Link href="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</Link>
            </span>
          </label>
          {errors.agreed && <p className="text-xs text-red-500">{errors.agreed}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60 active:translate-y-px"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">OR</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <button
        type="button"
        onClick={handleGoogleSignup}
        disabled={googleLoading}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3L37 10.1C33.7 7.1 29.1 5 24 5 12.9 5 4 13.9 4 25s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9"/><path fill="#FF3D00" d="M6.3 15.5 13.9 21c2-5.5 7.1-9.5 13.1-9.5 3.1 0 5.8 1.1 7.9 3L41 8.6C37.5 5.3 31.1 3 24 3 16.3 3 9.6 7.7 6.3 15.5"/><path fill="#4CAF50" d="M24 45c6 0 11.3-2 15.3-5.2l-7.1-5.8C30.2 35.7 27.2 37 24 37c-5.3 0-9.7-3.3-11.3-7.9l-7.6 5.8C8.7 41 15.9 45 24 45"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.8l7.1 5.8C37.3 43.2 44 38 44 25c0-1.3-.1-2.6-.4-3.9"/></svg>
        Sign up with Google
      </button>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
