'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MailCheck, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 900))
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <div className="flex min-h-screen">
      {/* ── LEFT: form panel ── */}
      <div className="flex w-full flex-col justify-between bg-white px-10 py-10 md:w-[45%] md:px-14">
        {/* Logo */}
        <div className="pt-2">
          <Image
            src="/logo-blue-full.png"
            alt="Mini Manager"
            width={150}
            height={52}
            className="object-contain"
            style={{ filter: 'hue-rotate(10deg) saturate(0.85) brightness(0.88)' }}
            priority
          />
        </div>

        {/* Form / Success */}
        <div className="mx-auto w-full max-w-sm animate-page-in">
          {submitted ? (
            <div className="text-center">
              <div className="mb-5 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <MailCheck className="text-primary" size={30} />
                </div>
              </div>
              <h1 className="mb-2 text-2xl font-bold text-gray-900">Check your email</h1>
              <p className="mb-6 text-sm text-gray-500">
                We sent a reset link to <span className="font-medium text-gray-800">{email}</span>.<br />
                It expires in 30 minutes.
              </p>
              <p className="text-sm text-gray-400">
                Didn&apos;t receive it?{' '}
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="font-medium text-primary hover:underline"
                >
                  Try again
                </button>
              </p>
            </div>
          ) : (
            <>
              <Link href="/login" className="mb-6 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
                <ArrowLeft size={14} />
                Back to sign in
              </Link>

              <h1 className="mb-1 text-3xl font-bold tracking-tight text-gray-900">Reset password</h1>
              <p className="mb-8 text-sm text-gray-500">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    className={`h-11 rounded-lg border bg-gray-50 px-3 text-sm focus:bg-white ${error ? 'border-red-400' : 'border-gray-200'}`}
                  />
                  {error && <p className="text-xs text-red-500">{error}</p>}
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-center gap-4">
          <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600 hover:underline">Terms</Link>
          <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600 hover:underline">Privacy</Link>
        </div>
      </div>

      {/* ── RIGHT: brand panel ── */}
      <div className="relative hidden flex-1 overflow-hidden bg-primary md:flex md:flex-col md:items-center md:justify-center md:px-14">
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 h-[480px] w-[480px] rounded-full bg-white/10" />
        <div className="absolute right-1/4 top-1/3 h-56 w-56 rounded-full bg-white/5" />
        <div className="absolute left-1/3 top-1/4 h-32 w-32 rounded-full bg-white/10" />

        <div className="relative z-10 max-w-xs text-center">
          <h2 className="mb-4 text-3xl font-bold leading-tight text-white">
            Your account<br />is secure
          </h2>
          <p className="mb-8 text-base leading-relaxed text-white/75">
            We&apos;ll send a secure link to your email. It expires in 30 minutes.
          </p>
          <div className="space-y-3 text-left">
            {[
              'Reset link expires in 30 minutes',
              'Your files and data stay untouched',
              'Contact support if you need help',
            ].map(text => (
              <div key={text} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-white/80" size={16} />
                <span className="text-sm text-white/80">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
