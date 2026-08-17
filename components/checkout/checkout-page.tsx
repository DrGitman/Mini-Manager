'use client'

import { useEffect, useRef, useState } from 'react'
import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import {
  ShieldCheck,
  Lock,
  ArrowLeft,
  FolderSearch,
  Undo2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import EftPayment from './eft-payment'

/* ------------------------------------------------------------------ */
/*  Theme — matches the Mini Manager sidebar                           */
/* ------------------------------------------------------------------ */

const THEME = {
  accent: '#3364DB',      // brand blue — matches logo-dark_blue-full.png exactly
  accentSoft: '#EFF6FF',  // blue-50
  canvas: '#F1F5F9',      // slate-100
  surface: '#FFFFFF',
  ink: '#0F172A',         // slate-900
  muted: '#64748B',       // slate-500
  hairline: '#E2E8F0',    // slate-200
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface CheckoutPageProps {
  /** Paddle price ID, e.g. "pri_01abc..." */
  priceId: string
  /** "sandbox" while testing, "production" when live. */
  environment?: 'sandbox' | 'production'
  /** Client-side token — safe to expose. NEVER the API key. */
  clientToken: string
  /** Prefill if the user is signed in. */
  customerEmail?: string
  /**
   * Rides through to the webhook. Must contain `user_email` or `user_id` —
   * those are the keys backend/api/routers/subscriptions.py resolves users by.
   */
  customData?: Record<string, string>
  /** Plan name shown in the summary, e.g. "Mini Manager Pro". */
  planName?: string
  /** Shown until Paddle reports the real, tax-inclusive, localized total. */
  fallbackPrice?: string
  /** Billing interval label shown next to the price. */
  interval?: string
  /** Fired on checkout.completed — provision in the webhook, not here. */
  onSuccess?: () => void
  onBack?: () => void
  /** Which plan the EFT claim should be raised for. */
  planKey?: string
}

/* ------------------------------------------------------------------ */

const INCLUDED: { icon: LucideIcon; text: string }[] = [
  { icon: FolderSearch, text: 'Unlimited files and folders' },
  { icon: Sparkles, text: 'Rules written in your own words' },
  { icon: Undo2, text: 'Full history with one-click undo' },
]

export default function CheckoutPage({
  priceId,
  environment = 'sandbox',
  clientToken,
  customerEmail,
  customData,
  planName = 'Mini Manager Pro',
  fallbackPrice = '$19.00',
  interval = '/ month',
  onSuccess,
  onBack,
  planKey = 'pro',
}: CheckoutPageProps) {
  const [method, setMethod] = useState<'eft' | 'card'>('eft')
  const [paddle, setPaddle] = useState<Paddle>()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState<string | null>(null)
  const opened = useRef(false)
  const initStarted = useRef(false)

  // Keep the latest onSuccess without re-running the init effect.
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  /* --- boot Paddle.js --- */

  useEffect(() => {
    // React StrictMode runs effects twice in dev; initializePaddle refuses the
    // second call, so guard it rather than letting it warn and no-op.
    if (initStarted.current) return
    initStarted.current = true

    initializePaddle({
      environment,
      token: clientToken,
      eventCallback: (event) => {
        // Mirror Paddle's own localized, tax-inclusive figure rather than
        // hardcoding a price that could disagree with what's charged.
        if (event.name === 'checkout.loaded' || event.name === 'checkout.updated') {
          const t = event.data?.totals?.total
          const currency = event.data?.currency_code
          if (t != null && currency) {
            setTotal(
              new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(t),
            )
          }
          setReady(true)
        }
        if (event.name === 'checkout.completed') {
          onSuccessRef.current?.()
        }
        if (event.name === 'checkout.error') {
          setError('Something went wrong loading the payment form.')
        }
      },
    })
      .then((p) => p && setPaddle(p))
      .catch(() => setError("Couldn't reach the payment provider."))
  }, [environment, clientToken])

  /* --- open the inline checkout once Paddle is up --- */

  useEffect(() => {
    if (!paddle || opened.current) return
    opened.current = true

    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      ...(customerEmail ? { customer: { email: customerEmail } } : {}),
      ...(customData ? { customData } : {}),
      settings: {
        displayMode: 'inline',
        frameTarget: 'paddle-checkout-frame',
        frameInitialHeight: 450,
        frameStyle:
          'width:100%; min-width:312px; background-color:transparent; border:none;',
        theme: 'light',
        showAddDiscounts: true,
      },
    })
  }, [paddle, priceId, customerEmail, customData])

  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen w-full px-4 py-10" style={{ backgroundColor: THEME.canvas }}>
      <div
        className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl shadow-xl shadow-slate-900/[0.06] md:grid-cols-[1.15fr_1fr]"
        style={{ backgroundColor: THEME.surface }}
      >
        {/* ---------------- LEFT: order summary ---------------- */}
        <div className="flex flex-col justify-between p-8 md:p-12">
          <div>
            {onBack && (
              <button
                onClick={onBack}
                className="mb-8 inline-flex items-center gap-1.5 text-sm transition hover:opacity-70"
                style={{ color: THEME.muted }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}

            {/* wordmark */}
            <div className="mb-10 flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no loader needed */}
              <img
                src="/logo-dark_blue-full.png"
                alt="Mini Manager"
                className="h-9 w-auto object-contain object-left"
              />
            </div>

            <h1
              className="text-2xl font-semibold tracking-tight md:text-[28px]"
              style={{ color: THEME.ink }}
            >
              {planName}
            </h1>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-wider" style={{ color: THEME.muted }}>
                Total today
              </p>
              <p
                className="mt-1 text-5xl font-bold tracking-tight tabular-nums"
                style={{ color: THEME.ink }}
              >
                {total ?? fallbackPrice}
                <span className="ml-1.5 text-base font-normal" style={{ color: THEME.muted }}>
                  {interval}
                </span>
              </p>
            </div>

            {/* what's included */}
            <ul className="mt-10 space-y-3.5">
              {INCLUDED.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: THEME.accentSoft }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: THEME.accent }} />
                  </span>
                  <span className="text-sm" style={{ color: THEME.ink }}>
                    {text}
                  </span>
                </li>
              ))}
            </ul>

            {/* the reassurance that actually sells this product */}
            <div className="mt-10 rounded-xl p-4" style={{ backgroundColor: THEME.accentSoft }}>
              <div className="flex gap-2.5">
                <ShieldCheck
                  className="h-4 w-4 shrink-0 translate-y-0.5"
                  style={{ color: THEME.accent }}
                />
                <p className="text-[13px] leading-relaxed" style={{ color: THEME.ink }}>
                  Your file contents never leave your computer. Mini Manager only reads
                  filenames, sizes and dates.
                </p>
              </div>
            </div>
          </div>

          <div
            className="mt-10 space-y-1.5 border-t pt-6 text-xs leading-relaxed"
            style={{ borderColor: THEME.hairline, color: THEME.muted }}
          >
            <p>
              Cancel any time. Refunds available within 14 days — see our{' '}
              <a href="/refunds" className="underline underline-offset-2">
                refund policy
              </a>
              .
            </p>
            <p>
              By subscribing you agree to our{' '}
              <a href="/terms" className="underline underline-offset-2">
                Terms
              </a>{' '}
              and{' '}
              <a href="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>

        {/* ---------------- RIGHT: payment method ---------------- */}
        <div
          className="border-l p-8 md:p-10"
          style={{ backgroundColor: '#F8FAFC', borderColor: THEME.hairline }}
        >
          <h2 className="text-xl font-semibold tracking-tight" style={{ color: THEME.ink }}>
            Payment details
          </h2>

          {/* Namibian customers pay by instant EFT, so that leads. Card stays
              available for everyone else. */}
          <div
            className="mt-5 grid grid-cols-2 gap-1 rounded-xl p-1"
            style={{ backgroundColor: '#E8EDF5' }}
          >
            {(['eft', 'card'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className="rounded-lg py-2 text-sm font-semibold transition"
                style={
                  method === m
                    ? { backgroundColor: THEME.surface, color: THEME.ink, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                    : { color: THEME.muted }
                }
              >
                {m === 'eft' ? 'Bank transfer (EFT)' : 'Card'}
              </button>
            ))}
          </div>

          {method === 'eft' && (
            <div className="mt-6">
              <EftPayment plan={planKey} />
            </div>
          )}

          <div
            className="relative mt-6 min-h-[420px]"
            style={{ display: method === 'card' ? undefined : 'none' }}
          >
            {/* skeleton while Paddle mounts */}
            {!ready && !error && (
              <div className="absolute inset-0 space-y-5">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-2.5 w-20 animate-pulse rounded bg-slate-200" />
                    <div className="h-9 w-full animate-pulse rounded-md bg-slate-200/70" />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 text-sm font-medium text-amber-900 underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Paddle mounts its secure iframe here. The class name must match
                settings.frameTarget exactly. Never put card inputs near this. */}
            <div className="paddle-checkout-frame" />
          </div>

          <div
            className="mt-6 flex items-center justify-center gap-1.5 text-xs"
            style={{ color: THEME.muted }}
          >
            <Lock className="h-3 w-3" />
            Secured by Paddle
          </div>
        </div>
      </div>
    </div>
  )
}
