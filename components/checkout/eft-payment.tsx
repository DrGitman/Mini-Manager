'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Copy, Check, Upload, Loader2, ShieldCheck, Zap, AlertTriangle, Clock,
} from 'lucide-react'
import {
  apiCreateEftClaim, apiUploadEftProof,
  type EftClaim, type EftProofResult,
} from '@/lib/api'

const THEME = {
  accent: '#3364DB',
  accentSoft: '#EFF6FF',
  ink: '#0F172A',
  muted: '#64748B',
  hairline: '#E2E8F0',
}

function Row({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — the value is visible anyway */
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm shrink-0" style={{ color: THEME.muted }}>{label}</span>
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate" style={{ color: THEME.ink }}>{value}</span>
        {copyable && (
          <button
            onClick={copy}
            className="shrink-0 rounded p-1 transition hover:bg-slate-100"
            aria-label={`Copy ${label}`}
          >
            {copied
              ? <Check className="h-3.5 w-3.5" style={{ color: '#16a34a' }} />
              : <Copy className="h-3.5 w-3.5" style={{ color: THEME.muted }} />}
          </button>
        )}
      </span>
    </div>
  )
}

export default function EftPayment({ plan = 'pro' }: { plan?: string }) {
  const [claim, setClaim] = useState<EftClaim | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [result, setResult] = useState<EftProofResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiCreateEftClaim(plan)
      .then(setClaim)
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Could not start payment'))
  }, [plan])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !claim) return

    setUploadError(null)
    setUploading(true)
    try {
      setResult(await apiUploadEftProof(claim.reference, file))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm text-amber-900">{loadError}</p>
      </div>
    )
  }

  if (!claim) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-9 w-full animate-pulse rounded bg-slate-200/70" />
        ))}
      </div>
    )
  }

  const b = claim.bank_details

  // ── Outcome after the agent has read the proof ──────────────────────────────
  if (result) {
    const tone =
      result.decision === 'activate'
        ? { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', Icon: ShieldCheck }
        : result.decision === 'review'
        ? { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', Icon: Clock }
        : { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', Icon: AlertTriangle }

    return (
      <div className="space-y-4">
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: tone.bg, borderColor: tone.border }}
        >
          <div className="flex gap-3">
            <tone.Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: tone.text }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: tone.text }}>
                {result.message}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: tone.text, opacity: 0.85 }}>
                Reference {claim.reference}
                {result.confidence != null && ` · read with ${Math.round(result.confidence * 100)}% confidence`}
              </p>
            </div>
          </div>
        </div>

        {result.decision === 'reject' && (
          <button
            onClick={() => { setResult(null); setUploadError(null) }}
            className="w-full rounded-xl py-3 text-sm font-bold text-white transition hover:opacity-90"
            style={{ backgroundColor: THEME.accent }}
          >
            Try another document
          </button>
        )}
      </div>
    )
  }

  // ── Payment instructions + proof upload ─────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider" style={{ color: THEME.muted }}>
          Amount due
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums" style={{ color: THEME.ink }}>
          N${claim.amount.toFixed(2)}
        </p>
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: THEME.hairline }}>
        <Row label="Reference" value={claim.reference} copyable />
        <div className="h-px" style={{ backgroundColor: THEME.hairline }} />
        <Row label="Account name" value={b.account_name} />
        <Row label="Bank" value={b.bank} />
        <Row label="Account number" value={b.account_number} copyable />
        {/* Most app-based payers pick the bank from a list and never type this,
            so show it only when it's configured rather than an empty row. */}
        {b.branch_code && <Row label="Branch code" value={b.branch_code} copyable />}
      </div>

      <div className="flex gap-2.5 rounded-xl p-4" style={{ backgroundColor: THEME.accentSoft }}>
        <Zap className="mt-0.5 h-4 w-4 shrink-0" style={{ color: THEME.accent }} />
        <p className="text-[13px] leading-relaxed" style={{ color: THEME.ink }}>
          {claim.instructions}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold" style={{ color: THEME.ink }}>
          Paid? Upload your proof
        </p>
        <p className="mb-3 text-[13px] leading-relaxed" style={{ color: THEME.muted }}>
          Your bank&apos;s confirmation — a PDF or screenshot. It&apos;s read automatically
          and your plan activates in about a minute.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: THEME.accent }}
        >
          {uploading
            ? <><Loader2 className="h-4 w-4 animate-spin" />Reading your document…</>
            : <><Upload className="h-4 w-4" />Upload proof of payment</>}
        </button>

        {uploadError && (
          <p className="mt-2 text-sm text-red-600">{uploadError}</p>
        )}

        {claim.proof_email && (
          <p className="mt-3 text-center text-[13px]" style={{ color: THEME.muted }}>
            Can&apos;t upload? Email it to{' '}
            <a
              href={`mailto:${claim.proof_email}?subject=${encodeURIComponent(
                `Proof of payment — ${claim.reference}`,
              )}`}
              className="font-medium underline underline-offset-2"
              style={{ color: THEME.accent }}
            >
              {claim.proof_email}
            </a>{' '}
            with <span className="font-medium">{claim.reference}</span> in the subject.
          </p>
        )}
      </div>
    </div>
  )
}
