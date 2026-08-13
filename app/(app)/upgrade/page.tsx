'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, Loader2, Sparkles, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { apiCreateCheckout } from '@/lib/api'
import { getSession, updateUser } from '@/lib/session'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const FREE_FEATURES = [
  '500 files/month scan',
  '200 AI classifications/month',
  '3 document explanations/month',
  '1 naming convention preset',
  'Unlimited undo & archive',
]

const PRO_FEATURES = [
  'Everything in Free, plus:',
  'Unlimited scans',
  'Unlimited AI classifications',
  '50 document explanations/month',
  'Unlimited naming conventions',
  'Plain-English rules',
  'Scheduled auto-organize',
  'Duplicate detection',
  'Stale-file alerts',
  'Risk flagging on contracts',
]

const BUSINESS_FEATURES = [
  'Everything in Pro, plus:',
  'Renewal dates → calendar',
  'Client folder templates',
  'Exportable audit trail',
  'Shareable rule packs',
  'Priority support',
]

const TESTIMONIALS = [
  {
    id: 't1',
    quote: 'Cut my Downloads folder from 1,847 files to 12 folders in 20 minutes.',
    author: 'Amara K.',
    location: 'Windhoek',
  },
  {
    id: 't2',
    quote: 'The undo feature alone is worth it. I accidentally moved a whole project folder and got it back in one click.',
    author: 'Jürgen M.',
    location: 'Berlin',
  },
  {
    id: 't3',
    quote: 'Finally understand my own file structure.',
    author: 'Thandiwe N.',
    location: 'Johannesburg',
  },
]

// ---------------------------------------------------------------------------
// Paddle.js types (minimal)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void }
      Initialize: (opts: { token: string; eventCallback?: (e: PaddleEvent) => void }) => void
      Checkout: {
        open: (opts: {
          transactionId?: string
          items?: Array<{ priceId: string; quantity: number }>
          customer?: { email: string }
          customData?: Record<string, string>
        }) => void
      }
    }
  }
}

interface PaddleEvent {
  name: string
  data?: { status?: string; customer?: { email?: string } }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeatureItem({ text, muted = false }: { text: string; muted?: boolean }) {
  if (muted) return <li className="text-sm text-muted-foreground font-medium mt-1">{text}</li>
  return (
    <li className="flex items-center gap-2 text-sm text-foreground">
      <Check className="h-4 w-4 text-primary shrink-0" />
      {text}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Hook: load Paddle.js once
// ---------------------------------------------------------------------------

function usePaddle(onSuccess: () => void) {
  const ready = useRef(false)

  useEffect(() => {
    if (ready.current || typeof window === 'undefined') return

    const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    if (!clientToken) return

    const existing = document.getElementById('paddle-js')
    if (existing) {
      initPaddle(clientToken, onSuccess)
      ready.current = true
      return
    }

    const script = document.createElement('script')
    script.id = 'paddle-js'
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
    script.async = true
    script.onload = () => {
      initPaddle(clientToken, onSuccess)
      ready.current = true
    }
    document.head.appendChild(script)
  }, [onSuccess])
}

function initPaddle(token: string, onSuccess: () => void) {
  if (!window.Paddle) return
  window.Paddle.Environment.set('sandbox')
  window.Paddle.Initialize({
    token,
    eventCallback(e: PaddleEvent) {
      if (e.name === 'checkout.completed') {
        onSuccess()
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UpgradePage() {
  const searchParams = useSearchParams()
  const [annual, setAnnual] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(searchParams.get('paddle_status') === 'success')

  const session = getSession()
  const currentPlan = session?.plan ?? 'free'

  const proMonthly = 19
  const proAnnual  = 13
  const bizMonthly = 49
  const bizAnnual  = 34

  const proPrice = annual ? proAnnual  : proMonthly
  const bizPrice = annual ? bizAnnual  : bizMonthly
  const proLabel = annual ? `$${proPrice}/month billed annually` : `$${proPrice}/month`
  const bizLabel = annual ? `$${bizPrice}/seat/month billed annually` : `$${bizPrice}/seat/month`

  function handleSuccess() {
    updateUser({ plan: 'pro' })
    setSuccess(true)
    setLoading(false)
  }

  usePaddle(handleSuccess)

  async function handleUpgradePro() {
    setLoading(true)
    setError(null)
    try {
      const priceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO
      if (!priceId) throw new Error('Pro price not configured')

      if (!window.Paddle) throw new Error('Paddle.js not loaded yet — try again')

      const email = session?.email
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        ...(email ? { customer: { email } } : {}),
        customData: email ? { user_email: email } : {},
      })
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-8">
      {/* Page header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Upgrade Mini Manager</h1>
        <p className="text-muted-foreground mt-2">Unlock unlimited AI organization.</p>
      </div>

      {/* Success banner */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800 text-sm font-medium">
          <Check className="h-4 w-4 shrink-0" />
          You&apos;re now on Pro! Enjoy unlimited AI organization.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Annual / Monthly toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm font-medium ${!annual ? 'text-foreground' : 'text-muted-foreground'}`}>
          Monthly
        </span>
        <Switch checked={annual} onCheckedChange={setAnnual} />
        <span className={`text-sm font-medium ${annual ? 'text-foreground' : 'text-muted-foreground'}`}>
          Annually
        </span>
        <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-100 text-xs">
          Save 30%
        </Badge>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-3 gap-4 items-start pt-5 overflow-visible">
        {/* Free */}
        <Card className="bg-card border border-border rounded-lg shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Free</CardTitle>
            <div>
              <span className="text-3xl font-bold text-foreground">$0</span>
              <span className="text-muted-foreground text-sm ml-1">/month</span>
            </div>
            <CardDescription>Great for getting started</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              {FREE_FEATURES.map((f) => <FeatureItem key={f} text={f} />)}
            </ul>
            <Button disabled variant="outline" className="w-full mt-2">
              {currentPlan === 'free' ? 'Current plan' : 'Downgrade'}
            </Button>
          </CardContent>
        </Card>

        {/* Pro — elevated */}
        <Card className="bg-card border-2 border-primary rounded-lg shadow-md">
          <CardHeader className="pb-4 pt-5">
            <div className="flex justify-center -mt-5 mb-3">
              <Badge className="bg-primary text-primary-foreground shadow-sm">Most Popular</Badge>
            </div>
            <CardTitle className="text-lg font-semibold text-primary">Pro</CardTitle>
            <div>
              <span className="text-3xl font-bold text-foreground">${proPrice}</span>
              <span className="text-muted-foreground text-sm ml-1">/month</span>
            </div>
            <CardDescription>{proLabel}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              {PRO_FEATURES.map((f, i) => <FeatureItem key={f} text={f} muted={i === 0} />)}
            </ul>
            {currentPlan === 'pro' ? (
              <Button disabled variant="outline" className="w-full mt-2">
                <Check className="h-4 w-4 mr-1.5" />
                Current plan
              </Button>
            ) : (
              <Button
                className="w-full mt-2"
                onClick={handleUpgradePro}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" />
                )}
                {loading ? 'Opening checkout…' : 'Upgrade to Pro'}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Business */}
        <Card className="bg-card border border-border rounded-lg shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Business</CardTitle>
            <div>
              <span className="text-3xl font-bold text-foreground">${bizPrice}</span>
              <span className="text-muted-foreground text-sm ml-1">/seat/month</span>
            </div>
            <CardDescription>{bizLabel}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              {BUSINESS_FEATURES.map((f, i) => <FeatureItem key={f} text={f} muted={i === 0} />)}
            </ul>
            <Button variant="outline" className="w-full mt-2">
              Contact Sales
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Footer note */}
      <p className="text-center text-sm text-muted-foreground">
        All plans include unlimited undo, archive, and blocked-path protection.{' '}
        <span className="font-medium text-foreground">We never paywall safety.</span>
      </p>

      {/* Testimonials */}
      <div>
        <p className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          What users say
        </p>
        <div className="grid grid-cols-3 gap-4">
          {TESTIMONIALS.map((t) => (
            <Card key={t.id} className="bg-card border border-border rounded-lg shadow-sm">
              <CardContent className="pt-5 pb-5 flex flex-col gap-3">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-foreground leading-relaxed italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground font-medium">
                  {t.author}, {t.location}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
