'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, CheckCircle2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { OrganizeRule } from '@/lib/types'

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const INITIAL_RULES: OrganizeRule[] = [
  {
    id: 'r1',
    naturalText: 'Put all invoices and receipts in Documents/Finance',
    match: { extensions: ['.pdf'], nameContains: ['invoice', 'receipt'] },
    action: { targetFolder: 'Documents/Finance' },
    enabled: true,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
  },
  {
    id: 'r2',
    naturalText: 'Move screenshots older than 30 days to Images/Old Screenshots',
    match: { nameContains: ['screenshot', 'screen shot'], olderThanDays: 30 },
    action: { targetFolder: 'Images/Old Screenshots' },
    enabled: true,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
  },
  {
    id: 'r3',
    naturalText: 'Archive ZIP and RAR files larger than 100MB to Archives/Large',
    match: { extensions: ['.zip', '.rar'], largerThanMB: 100 },
    action: { targetFolder: 'Archives/Large' },
    enabled: false,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
  },
  {
    id: 'r4',
    naturalText: 'Keep cover letters and resumes in Documents/Career',
    match: { nameContains: ['resume', 'cv', 'cover letter', 'cover_letter'] },
    action: { targetFolder: 'Documents/Career' },
    enabled: true,
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSummary(rule: OrganizeRule): string {
  const parts: string[] = []
  if (rule.match.extensions?.length) {
    parts.push(`${rule.match.extensions.join(', ')} files`)
  }
  if (rule.match.nameContains?.length) {
    parts.push(`with '${rule.match.nameContains.join("' or '")}' in name`)
  }
  if (rule.match.olderThanDays) {
    parts.push(`older than ${rule.match.olderThanDays} days`)
  }
  if (rule.match.largerThanMB) {
    parts.push(`larger than ${rule.match.largerThanMB} MB`)
  }
  const matchStr = parts.length ? `Matches: ${parts.join(', ')}` : 'Matches: all files'
  return `${matchStr} → ${rule.action.targetFolder}`
}

let nextId = 5

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RulesPage() {
  const [rules, setRules] = useState<OrganizeRule[]>(INITIAL_RULES)
  const [showAdd, setShowAdd] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [compiled, setCompiled] = useState<OrganizeRule | null>(null)

  function toggleRule(id: string) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    )
  }

  function deleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  async function handleCompile() {
    if (!draftText.trim()) return
    setCompiling(true)
    setCompiled(null)
    await new Promise((res) => setTimeout(res, 800))
    const newRule: OrganizeRule = {
      id: `r${nextId++}`,
      naturalText: draftText.trim(),
      match: { nameContains: ['document'] },
      action: { targetFolder: 'Documents/General' },
      enabled: true,
      createdAt: Date.now(),
    }
    setCompiled(newRule)
    setCompiling(false)
  }

  function handleAddCompiled() {
    if (!compiled) return
    setRules((prev) => [...prev, compiled])
    setCompiled(null)
    setDraftText('')
    setShowAdd(false)
  }

  function handleCancel() {
    setShowAdd(false)
    setDraftText('')
    setCompiled(null)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Rules</h1>
        <p className="text-muted-foreground mt-1">
          Write rules in plain English. Mini Manager will follow them every time.
        </p>
      </div>

      {/* Active Rules card */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-base font-semibold">Active Rules</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-0.5">
              {rules.filter((r) => r.enabled).length} of {rules.length} rules enabled
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Rule
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground text-sm">
              No rules yet. Add your first rule above.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className={`flex items-start gap-4 px-6 py-4 transition-opacity ${
                    rule.enabled ? 'opacity-100' : 'opacity-60'
                  }`}
                >
                  {/* Toggle */}
                  <div className="pt-0.5 shrink-0">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleRule(rule.id)}
                    />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground leading-snug">
                      {rule.naturalText}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {buildSummary(rule)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-sm font-medium text-destructive transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Delete</span>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete rule?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This rule will be removed permanently and Mini Manager will stop following it.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteRule(rule.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Add Rule inline form */}
          {showAdd && (
            <>
              <Separator />
              <div className="px-6 py-5 flex flex-col gap-4">
                <p className="text-sm font-medium text-foreground">Describe your new rule</p>
                <Textarea
                  rows={3}
                  placeholder="Describe your rule in plain English..."
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  className="resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleCompile}
                    disabled={compiling || !draftText.trim()}
                  >
                    {compiling ? 'Compiling...' : 'Compile with AI →'}
                  </Button>
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>

                {/* Compiled preview */}
                {compiled && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-100">
                        Rule compiled
                      </Badge>
                    </div>
                    <div className="text-sm text-foreground">
                      <span className="text-muted-foreground">Target folder: </span>
                      <span className="font-medium">{compiled.action.targetFolder}</span>
                    </div>
                    <div className="text-sm text-foreground">
                      <span className="text-muted-foreground">Match: </span>
                      <span className="font-medium">{buildSummary(compiled)}</span>
                    </div>
                    <Button size="sm" className="mt-1 w-fit" onClick={handleAddCompiled}>
                      Add to rules
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardContent className="flex items-start gap-3 pt-5 pb-5">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Rules run before AI classification. High-priority rules always win.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
