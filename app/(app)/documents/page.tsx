'use client'

import { useState } from 'react'
import { Upload, Sparkles, AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskLevel = 'Low' | 'Medium' | 'High'

interface Clause {
  id: string
  title: string
  body: string
  risk: RiskLevel
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_CLAUSES: Clause[] = [
  {
    id: 'c1',
    title: 'Payment Terms',
    body: 'Net 30 from invoice date. Late payments incur 1.5% monthly interest.',
    risk: 'Low',
  },
  {
    id: 'c2',
    title: 'Intellectual Property',
    body: 'All work product transfers to client on final payment. Freelancer retains portfolio rights.',
    risk: 'Medium',
  },
  {
    id: 'c3',
    title: 'Non-Compete',
    body: '12-month non-compete in same industry within Namibia.',
    risk: 'High',
  },
  {
    id: 'c4',
    title: 'Termination',
    body: 'Either party may terminate with 14 days written notice.',
    risk: 'Low',
  },
  {
    id: 'c5',
    title: 'Liability Cap',
    body: 'Liability limited to fees paid in the past 3 months.',
    risk: 'Low',
  },
]

const AI_SUMMARY =
  'This is a standard freelance services agreement. The non-compete clause (Section 7) is unusually broad — consult a lawyer before signing. Payment terms are standard net-30.'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskBadge(risk: RiskLevel) {
  if (risk === 'High') {
    return (
      <Badge className="bg-red-100 text-red-700 border-0 hover:bg-red-100 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        High risk
      </Badge>
    )
  }
  if (risk === 'Medium') {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-0 hover:bg-amber-100">
        Medium risk
      </Badge>
    )
  }
  return (
    <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-100 flex items-center gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Low risk
    </Badge>
  )
}

function riskRowClass(risk: RiskLevel) {
  if (risk === 'High') return 'border-l-2 border-red-400 pl-4'
  if (risk === 'Medium') return 'border-l-2 border-amber-400 pl-4'
  return 'border-l-2 border-green-400 pl-4'
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  const [expandedClause, setExpandedClause] = useState<string | null>(null)
  const [question, setQuestion]             = useState('')
  const [answer, setAnswer]                 = useState('')
  const [asking, setAsking]                 = useState(false)

  function toggleClause(id: string) {
    setExpandedClause((prev) => (prev === id ? null : id))
  }

  async function handleAsk() {
    if (!question.trim()) return
    setAsking(true)
    await new Promise((res) => setTimeout(res, 600))
    setAnswer(
      `Based on my analysis of this document, the most relevant clause to your question is the ${
        DEMO_CLAUSES[2].title
      } section — "${DEMO_CLAUSES[2].body}" This may significantly impact your ability to work with other clients in the same space.`,
    )
    setAsking(false)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Documents</h1>
        <p className="text-muted-foreground mt-1">
          Ask Mini Manager to explain any document in plain English.
        </p>
      </div>

      {/* Upload zone */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardContent className="pt-6 pb-6">
          <div className="border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center py-12 gap-3 cursor-pointer hover:border-primary/50 transition-colors">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Drop a document here or click to select
            </p>
            <p className="text-xs text-muted-foreground">
              Supports PDF, DOCX, TXT — file contents are sent to Gemini for explanation
            </p>
            <Button variant="outline" size="sm" className="mt-2">
              Select File
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Demo document */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">Demo</Badge>
            <CardTitle className="text-base font-semibold">
              Sample: Freelance Contract — contract_freelance_2025.pdf
            </CardTitle>
          </div>
          <CardDescription>
            Key clauses extracted and risk-flagged by Gemini
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {DEMO_CLAUSES.map((clause) => (
            <div key={clause.id} className={`rounded-md bg-muted/40 p-3 ${riskRowClass(clause.risk)}`}>
              <button
                className="w-full flex items-center justify-between text-left"
                onClick={() => toggleClause(clause.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm text-foreground">{clause.title}</span>
                  {riskBadge(clause.risk)}
                </div>
                {expandedClause === clause.id
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                }
              </button>
              {expandedClause === clause.id && (
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {clause.body}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* AI Summary */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground leading-relaxed">
                {AI_SUMMARY}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Generated by Gemini</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ask a question */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Ask a question</CardTitle>
          <CardDescription>
            Ask anything about this document
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Can I work with competitors after this contract ends?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAsk() }}
              className="flex-1"
            />
            <Button onClick={handleAsk} disabled={asking || !question.trim()}>
              {asking ? 'Asking...' : 'Ask'}
            </Button>
          </div>
          {answer && (
            <div className="rounded-md bg-muted/50 border border-border p-4 text-sm text-foreground leading-relaxed">
              {answer}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage meter */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-3">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-foreground">
                <span className="font-medium">3 / 3</span> document explanations used this month
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <a href="/upgrade" className="text-primary hover:underline">
                  Upgrade to Pro for 50/month
                </a>
              </p>
            </div>
            <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-full bg-primary rounded-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
