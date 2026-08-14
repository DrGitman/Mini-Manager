'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CheckoutPage from '@/components/checkout/checkout-page'
import { getSession } from '@/lib/session'

const PLANS = {
  pro: {
    name: 'Mini Manager Pro',
    price: '$19.00',
    interval: '/ month',
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO,
  },
  business: {
    name: 'Mini Manager Business',
    price: '$49.00',
    interval: '/ seat / month',
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_BUSINESS,
  },
} as const

type PlanKey = keyof typeof PLANS

function CheckoutRoute() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  const planKey: PlanKey = searchParams.get('plan') === 'business' ? 'business' : 'pro'
  const plan = PLANS[planKey]

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    setEmail(session.email)
    setChecked(true)
  }, [router])

  if (!checked) return null

  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
  const environment =
    (process.env.NEXT_PUBLIC_PADDLE_ENV as 'sandbox' | 'production' | undefined) ?? 'sandbox'

  if (!clientToken || !plan.priceId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm text-amber-900">
            Checkout isn&apos;t configured yet. Set{' '}
            <code className="font-mono">NEXT_PUBLIC_PADDLE_CLIENT_TOKEN</code> and{' '}
            <code className="font-mono">
              NEXT_PUBLIC_PADDLE_PRICE_ID_{planKey.toUpperCase()}
            </code>
            .
          </p>
          <button
            onClick={() => router.push('/upgrade')}
            className="mt-3 text-sm font-medium text-amber-900 underline underline-offset-2"
          >
            Back to plans
          </button>
        </div>
      </div>
    )
  }

  return (
    <CheckoutPage
      priceId={plan.priceId}
      environment={environment}
      clientToken={clientToken}
      customerEmail={email ?? undefined}
      // These keys matter: subscriptions.py resolves the user by
      // custom_data.user_id or custom_data.user_email. Renaming them
      // silently breaks provisioning after a successful payment.
      customData={email ? { user_email: email } : undefined}
      planName={plan.name}
      fallbackPrice={plan.price}
      interval={plan.interval}
      onSuccess={() => {
        // Deliberately does NOT set the plan locally. The webhook is the only
        // thing that can grant it; /upgrade polls the server until it lands and
        // shows an "activating…" state meanwhile.
        router.push('/upgrade?paddle_status=success')
      }}
      onBack={() => router.push('/upgrade')}
    />
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CheckoutRoute />
    </Suspense>
  )
}
