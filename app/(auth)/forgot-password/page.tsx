'use client'

import { useState } from 'react'
import Link from 'next/link'
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

  // The (auth) layout already supplies the brand panel, logo, page padding and
  // the Terms/Privacy footer — this page renders the form only, same as /login.
  return (
    <div className="w-full max-w-[360px] animate-page-in">
      {submitted ? (
        <div className="text-center">
          <div className="mb-5 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <MailCheck className="text-primary" size={30} />
            </div>
          </div>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-900">Check your email</h1>
          <p className="mb-6 text-sm leading-relaxed text-gray-500">
            We sent a reset link to{' '}
            <span className="font-medium break-all text-gray-800">{email}</span>. It expires in
            30 minutes.
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
          <Link
            href="/login"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-600"
          >
            <ArrowLeft size={14} />
            Back to sign in
          </Link>

          <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">Reset password</h1>
          <p className="mb-7 text-sm text-gray-500">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                className={`auth-input h-11 w-full rounded-lg border bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 ${error ? 'border-red-400 animate-red-glow' : 'border-gray-300'}`}
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60 active:translate-y-px"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>

          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <CheckCircle2 className="mt-0.5 shrink-0 text-gray-400" size={15} />
            <p className="text-xs leading-relaxed text-gray-500">
              Your files and data stay untouched — resetting only changes how you sign in.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
