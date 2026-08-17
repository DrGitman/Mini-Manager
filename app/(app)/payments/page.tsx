'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Loader2, Check, X, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  apiListEftPayments, apiConfirmEftPayment, apiRejectEftPayment,
  type EftAdminClaim,
} from '@/lib/api'

const STATUS: Record<string, { label: string; cls: string }> = {
  reconciled:     { label: '✅ Reconciled',                cls: 'bg-green-100 text-green-800' },
  ai_verified:    { label: '🟡 AI-verified · unreconciled', cls: 'bg-amber-100 text-amber-800' },
  needs_review:   { label: '🟠 Needs review',              cls: 'bg-orange-100 text-orange-800' },
  awaiting_proof: { label: '⏳ Awaiting proof',            cls: 'bg-slate-100 text-slate-700' },
  rejected:       { label: '❌ Rejected',                  cls: 'bg-red-100 text-red-800' },
  expired:        { label: '⌛ Expired',                    cls: 'bg-slate-100 text-slate-500' },
}

export default function PaymentsPage() {
  const [rows, setRows] = useState<EftAdminClaim[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    try {
      setRows(await apiListEftPayments())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payments')
      setRows([])
    }
  }

  useEffect(() => { load() }, [])

  async function act(id: string, action: 'confirm' | 'reject') {
    setBusy(id)
    try {
      await (action === 'confirm' ? apiConfirmEftPayment(id) : apiRejectEftPayment(id))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const autonomous = rows?.filter(r => r.status === 'ai_verified' || r.status === 'reconciled').length ?? 0
  const deferred = rows?.filter(r => r.status === 'needs_review').length ?? 0

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            EFT claims verified by the payment agent. Confirm each one against your bank
            statement.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 size-4" /> Refresh
        </Button>
      </div>

      {/* Headline numbers — these are the submission evidence. */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total claims', value: rows?.length ?? '—' },
          { label: 'Agent activated', value: autonomous },
          { label: 'Deferred to human', value: deferred },
        ].map(s => (
          <Card key={s.label} className="border border-border">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {rows === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 && !error ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No payments yet.</p>
      ) : (
        <Card className="border border-border">
          <CardContent className="p-0">
            {rows.map(r => {
              const s = STATUS[r.status] ?? { label: r.status, cls: 'bg-slate-100 text-slate-700' }
              const expanded = open === r.id
              return (
                <div key={r.id} className="border-b border-border last:border-0">
                  <button
                    onClick={() => setOpen(expanded ? null : r.id)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-muted/40"
                  >
                    <span className="w-24 shrink-0 font-mono text-sm font-medium text-foreground">
                      {r.reference}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {r.email}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-foreground">
                      N${r.expected_amount.toFixed(2)}
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>
                      {s.label}
                    </span>
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {expanded && (
                    <div className="space-y-4 border-t border-border bg-muted/20 px-5 py-4">
                      {r.reasoning ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Agent reasoning
                            {r.confidence != null && ` · ${Math.round(r.confidence * 100)}% confidence`}
                          </p>
                          <p className="mt-1 text-sm text-foreground">{r.reasoning}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No proof submitted yet.</p>
                      )}

                      {r.extracted && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Extracted from document
                          </p>
                          <pre className="mt-1 overflow-x-auto rounded-lg bg-background p-3 text-xs text-foreground">
                            {JSON.stringify(r.extracted, null, 2)}
                          </pre>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy === r.id || r.status === 'reconciled'}
                          onClick={() => act(r.id, 'confirm')}
                        >
                          {busy === r.id
                            ? <Loader2 className="mr-1.5 size-4 animate-spin" />
                            : <Check className="mr-1.5 size-4" />}
                          Confirm on statement
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === r.id}
                          onClick={() => act(r.id, 'reject')}
                          className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <X className="mr-1.5 size-4" />
                          Reject &amp; downgrade
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
