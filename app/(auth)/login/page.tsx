'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { saveSession } from '@/lib/session'
import { apiLogin, API_BASE } from '@/lib/api'

const eAPI = typeof window !== 'undefined' ? (window as any).electronAPI : undefined
const isElectron = !!eAPI?.isElectron

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [shaking, setShaking] = useState(false)

  // Google sign-in can bounce back here with a reason it was refused —
  // most often that no account exists for that address yet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const message = params.get('message')
    if (params.get('error') && message) {
      setErrors(prev => ({ ...prev, form: message }))
    } else if (params.get('expired')) {
      setErrors(prev => ({ ...prev, form: 'Your session ended. Please sign in again.' }))
    }
  }, [])

  // Listen for Google OAuth callback from Electron protocol handler
  useEffect(() => {
    if (!isElectron) return
    eAPI.onGoogleAuthSuccess((data: any) => {
      setGoogleLoading(false)

      // A refused sign-in comes back through the same protocol handler with an
      // error and no token. Reading data.name here threw on undefined, so the
      // refusal surfaced as a blank crash instead of the reason.
      if (!data?.token) {
        setErrors(prev => ({
          ...prev,
          form: data?.message || 'Google sign-in failed. Please try again.',
        }))
        return
      }

      const displayName = data.name || data.email || 'User'
      const initials = displayName
        .split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('')
      saveSession(
        { name: displayName, email: data.email, avatarInitials: initials, plan: data.plan ?? 'free', joinedAt: Date.now() },
        data.token,
        true,
      )
      router.push('/organize')
    })
    return () => eAPI.removeGoogleAuthListener()
  }, [])

  async function handleGoogleLogin() {
    // intent=login means the backend will refuse rather than silently create an
    // account. Someone whose account was deleted, or who picks the wrong Google
    // account, gets told so instead of landing in a new empty one.
    if (isElectron) {
      setGoogleLoading(true)
      await eAPI.googleAuthStart({ intent: 'login', apiBase: API_BASE })
      // Result comes back via onGoogleAuthSuccess listener above
    } else {
      window.location.href = `${API_BASE}/api/v1/auth/google?mode=web&intent=login`
    }
  }

  function validate() {
    const next: typeof errors = {}
    if (!email.trim()) next.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email.'
    if (!password) next.password = 'Password is required.'
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
      const res = await apiLogin(email, password)
      const initials = res.name.split(' ').slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')
      saveSession(
        { name: res.name, email: res.email, avatarInitials: initials, plan: res.plan as 'free' | 'pro' | 'business', joinedAt: Date.now() },
        res.access_token,
        rememberMe,
      )
      router.push('/organize')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setErrors({ form: msg })
      setLoading(false)
    }
  }

  return (
    <div className={`w-full max-w-[360px] animate-page-in ${shaking ? 'animate-shake' : ''}`}>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">Welcome back</h1>
      <p className="mb-7 text-sm text-gray-500">Enter your details to continue.</p>

      {errors.form && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {errors.form}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4 stagger">
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
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

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <Checkbox checked={rememberMe} onCheckedChange={v => setRememberMe(v === true)} />
          Remember me
        </label>

        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60 active:translate-y-px"
        >
          {loading ? 'Signing in…' : 'Log in'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">OR</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={googleLoading}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
      >
        {googleLoading ? (
          <span className="size-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3L37 10.1C33.7 7.1 29.1 5 24 5 12.9 5 4 13.9 4 25s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9"/><path fill="#FF3D00" d="M6.3 15.5 13.9 21c2-5.5 7.1-9.5 13.1-9.5 3.1 0 5.8 1.1 7.9 3L41 8.6C37.5 5.3 31.1 3 24 3 16.3 3 9.6 7.7 6.3 15.5"/><path fill="#4CAF50" d="M24 45c6 0 11.3-2 15.3-5.2l-7.1-5.8C30.2 35.7 27.2 37 24 37c-5.3 0-9.7-3.3-11.3-7.9l-7.6 5.8C8.7 41 15.9 45 24 45"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.8l7.1 5.8C37.3 43.2 44 38 44 25c0-1.3-.1-2.6-.4-3.9"/></svg>
        )}
        {googleLoading ? 'Opening browser…' : 'Log in with Google'}
      </button>

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          Sign up for free
        </Link>
      </p>
    </div>
  )
}
