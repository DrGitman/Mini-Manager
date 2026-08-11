'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, CheckCircle2, Info, Loader2, FolderOpen, Tag, Clock, HardDrive, SpellCheck2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  apiGetRules, apiCreateRule, apiToggleRule, apiDeleteRule, apiCompileRule,
  type Rule, type CompiledRule,
} from '@/lib/api'

function buildSummary(rule: Rule | CompiledRule): string {
  const parts: string[] = []
  if (rule.match_extensions.length) parts.push(rule.match_extensions.join(', ') + ' files')
  if (rule.match_name_contains.length) parts.push(`name contains "${rule.match_name_contains.join('", "')}"`)
  if (rule.older_than_days) parts.push(`older than ${rule.older_than_days} days`)
  if (rule.larger_than_mb) parts.push(`larger than ${rule.larger_than_mb} MB`)
  const match = parts.length ? parts.join(' · ') : 'all files'
  return `${match} → ${rule.target_folder}`
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [compiled, setCompiled] = useState<CompiledRule | null>(null)
  const [compileError, setCompileError] = useState<string | null>(null)
  const [addingRule, setAddingRule] = useState(false)
  const [correctedText, setCorrectedText] = useState<string | null>(null)

  useEffect(() => {
    apiGetRules().then(setRules).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleToggle(id: string) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
    try {
      const updated = await apiToggleRule(id)
      setRules(prev => prev.map(r => r.id === id ? updated : r))
    } catch {
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
    }
  }

  async function handleDelete(id: string) {
    setRules(prev => prev.filter(r => r.id !== id))
    await apiDeleteRule(id).catch(() => {})
  }

  async function handleCompile() {
    if (!draftText.trim()) return
    setCompiling(true)
    setCompiled(null)
    setCompileError(null)
    setCorrectedText(null)
    try {
      const result = await apiCompileRule(draftText.trim())
      if (result.corrected_input && result.corrected_input !== draftText.trim()) {
        setCorrectedText(result.corrected_input)
      }
      setCompiled(result)
    } catch (e: unknown) {
      setCompileError(e instanceof Error ? e.message : 'Failed to compile rule')
    } finally {
      setCompiling(false)
    }
  }

  async function handleAddRule() {
    if (!compiled) return
    setAddingRule(true)
    try {
      const newRule = await apiCreateRule({
        natural_text: draftText.trim(),
        target_folder: compiled.target_folder,
        match_extensions: compiled.match_extensions,
        match_name_contains: compiled.match_name_contains,
        older_than_days: compiled.older_than_days,
        larger_than_mb: compiled.larger_than_mb,
      })
      setRules(prev => [newRule, ...prev])
      setDraftText('')
      setCompiled(null)
      setShowAdd(false)
    } catch (e: unknown) {
      setCompileError(e instanceof Error ? e.message : 'Failed to save rule')
    } finally {
      setAddingRule(false)
    }
  }

  function handleCancel() {
    setShowAdd(false)
    setDraftText('')
    setCompiled(null)
    setCompileError(null)
    setCorrectedText(null)
  }

  const enabledCount = rules.filter(r => r.enabled).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Rules</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Write rules in plain English. Mini Manager follows them on every scan.
        </p>
      </div>

      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-base font-semibold">Active Rules</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-0.5">
              {loading ? 'Loading…' : `${enabledCount} of ${rules.length} rules enabled`}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)} disabled={showAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Rule
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col divide-y divide-border">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : rules.length === 0 && !showAdd ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">No rules yet. Add your first rule above.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rules.map(rule => (
                <li key={rule.id} className={`flex items-start gap-4 px-6 py-4 transition-opacity ${rule.enabled ? 'opacity-100' : 'opacity-50'}`}>
                  <div className="pt-0.5 shrink-0">
                    <Switch checked={rule.enabled} onCheckedChange={() => handleToggle(rule.id)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground leading-snug">{rule.natural_text}</p>
                    <p className="text-xs text-muted-foreground mt-1">{buildSummary(rule)}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {rule.match_extensions.map(ext => <Badge key={ext} variant="secondary" className="text-[10px] font-mono">{ext}</Badge>)}
                      {rule.match_name_contains.map(kw => <Badge key={kw} variant="outline" className="text-[10px]">{kw}</Badge>)}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger className="shrink-0 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete rule?</AlertDialogTitle>
                        <AlertDialogDescription>This rule will be permanently removed.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(rule.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}

          {showAdd && (
            <>
              <Separator />
              <div className="px-6 py-5 flex flex-col gap-4">
                <p className="text-sm font-medium text-foreground">Describe your rule in plain English</p>
                <Textarea
                  rows={3}
                  placeholder='e.g. "Move all invoices and receipts to Documents/Finance"'
                  value={draftText}
                  onChange={e => setDraftText(e.target.value)}
                  className="resize-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button onClick={handleCompile} disabled={compiling || !draftText.trim()}>
                    {compiling ? <><Loader2 className="mr-2 size-4 animate-spin" />Compiling…</> : 'Compile with AI →'}
                  </Button>
                  <Button variant="outline" onClick={handleCancel}>Cancel</Button>
                </div>
                {compileError && <p className="text-sm text-destructive">{compileError}</p>}
                {correctedText && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 px-3 py-2">
                    <SpellCheck2 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-700 dark:text-amber-400">
                      <span className="font-medium">Spelling corrected: </span>
                      {correctedText}
                    </div>
                  </div>
                )}
                {compiled && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium text-foreground">Rule parsed</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{compiled.preview}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground"><FolderOpen className="size-3.5 shrink-0" /><span className="font-mono font-medium text-foreground">{compiled.target_folder}</span></div>
                      {compiled.match_extensions.length > 0 && <div className="flex items-center gap-1.5 text-muted-foreground"><Tag className="size-3.5 shrink-0" /><span>{compiled.match_extensions.join(', ')}</span></div>}
                      {compiled.older_than_days && <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="size-3.5 shrink-0" /><span>Older than {compiled.older_than_days} days</span></div>}
                      {compiled.larger_than_mb && <div className="flex items-center gap-1.5 text-muted-foreground"><HardDrive className="size-3.5 shrink-0" /><span>Larger than {compiled.larger_than_mb} MB</span></div>}
                    </div>
                    <Button size="sm" className="w-fit" onClick={handleAddRule} disabled={addingRule}>
                      {addingRule ? <><Loader2 className="mr-2 size-4 animate-spin" />Saving…</> : 'Add to rules'}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardContent className="flex items-start gap-3 pt-5 pb-5">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Rules run before AI classification and always take priority. Toggle a rule off to pause it without deleting it.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
