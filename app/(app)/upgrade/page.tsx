'use client'

import { useState } from 'react'
import { Check, Sparkles, Star } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

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
// Sub-components
// ---------------------------------------------------------------------------

function FeatureItem({ text, muted = false }: { text: string; muted?: boolean }) {
  if (muted) {
    return (
      <li className="text-sm text-muted-foreground font-medium mt-1">{text}</li>
    )
  }
  return (
    <li className="flex items-center gap-2 text-sm text-foreground">
      <Check className="h-4 w-4 text-primary shrink-0" />
      {text}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UpgradePage() {
  const [annual, setAnnual]                   = useState(false)
  const [showPayment, setShowPayment]         = useState(false)
  const [licenseKey, setLicenseKey]           = useState('')
  const [licenseActivated, setLicenseActivated] = useState(false)

  const proMonthly  = 19
  const proAnnual   = 13
  const bizMonthly  = 49
  const bizAnnual   = 34

  const proPrice   = annual ? proAnnual  : proMonthly
  const bizPrice   = annual ? bizAnnual  : bizMonthly
  const proLabel   = annual ? `$${proPrice}/month billed annually` : `$${proPrice}/month`
  const bizLabel   = annual ? `$${bizPrice}/seat/month billed annually` : `$${bizPrice}/seat/month`

  function handleActivateLicense() {
    if (!licenseKey.trim()) return
    setLicenseActivated(true)
  }

  return (
    <div className="flex flex-col gap-8 pb-8">
      {/* Page header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Upgrade Mini Manager</h1>
        <p className="text-muted-foreground mt-2">Unlock unlimited AI organization.</p>
      </div>

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
              {FREE_FEATURES.map((f) => (
                <FeatureItem key={f} text={f} />
              ))}
            </ul>
            <Button disabled variant="outline" className="w-full mt-2">
              Current plan
            </Button>
          </CardContent>
        </Card>

        {/* Pro — elevated */}
        <Card className="bg-card border-2 border-primary rounded-lg shadow-md">
          <CardHeader className="pb-4 pt-5">
            <div className="flex justify-center -mt-5 mb-3">
              <Badge className="bg-primary text-primary-foreground shadow-sm">
                Most Popular
              </Badge>
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
              {PRO_FEATURES.map((f, i) => (
                <FeatureItem key={f} text={f} muted={i === 0} />
              ))}
            </ul>
            <Button
              className="w-full mt-2"
              onClick={() => setShowPayment(true)}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Upgrade to Pro
            </Button>
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
              {BUSINESS_FEATURES.map((f, i) => (
                <FeatureItem key={f} text={f} muted={i === 0} />
              ))}
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

      {/* Payment section */}
      {showPayment && (
        <Card className="bg-card border border-border rounded-lg shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Activate your license</CardTitle>
            <CardDescription>
              Complete your Pro upgrade below
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Invoice */}
            <div className="rounded-md bg-muted/50 border border-border p-4 flex flex-col gap-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Invoice</p>
              <p className="text-lg font-bold text-foreground">INV-2026-0031</p>
              <p className="text-sm text-muted-foreground mt-1">
                Amount due:{' '}
                <span className="font-medium text-foreground">${proPrice}.00 USD</span>
              </p>
            </div>

            {/* Payment instructions */}
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Payment instructions</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Transfer <span className="font-medium text-foreground">${proPrice}</span> to{' '}
                <span className="font-mono text-foreground">First National Bank, Acc: 62012345678</span>{' '}
                referencing your invoice number{' '}
                <span className="font-medium text-foreground">INV-2026-0031</span>.
              </p>
            </div>

            <Separator />

            {/* License key input */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="license-key" className="text-sm font-medium">
                Or paste your license key below
              </Label>
              {licenseActivated ? (
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <Check className="h-4 w-4" />
                  License activated! Enjoy Pro.
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="license-key"
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    className="font-mono flex-1"
                  />
                  <Button
                    onClick={handleActivateLicense}
                    disabled={!licenseKey.trim()}
                  >
                    Activate
                  </Button>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Questions? Email{' '}
              <a href="mailto:support@minimanager.app" className="text-primary hover:underline">
                support@minimanager.app
              </a>
            </p>
          </CardContent>
        </Card>
      )}

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
