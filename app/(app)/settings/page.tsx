'use client'

import { useEffect, useState } from 'react'
import {
  Settings2, Shield, Bell, CreditCard, FolderPlus, X, Loader2, CheckCircle2, BookOpen, Plus, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { getSession } from '@/lib/session'
import {
  apiGetPreferences, apiSavePreferences, type Preferences,
  apiGetBlocklist, apiAddBlocklist, apiDeleteBlocklist, type BlocklistEntry,
  apiGetConventions, apiAddConvention, apiToggleConvention, apiDeleteConvention, type Convention,
} from '@/lib/api'
import { usePreferences } from '@/lib/preferences-context'

// ─── Constants ────────────────────────────────────────────────────────────────

const PROTECTED_EXTENSIONS = ['.exe', '.dll', '.sys', '.msi', '.bat', '.cmd']

const DEFAULT_PREFS: Preferences = {
  naming_style: 'title',
  categories: ['Documents', 'Images', 'Videos', 'Audio', 'Code', 'Archives'],
  target_folder: 'Desktop',
  quarantine_mode: 'auto',
  naming_convention: 'date-subject',
  auto_threshold: 0.85,
  review_threshold: 0.70,
  monitor_downloads: true,
  monitor_desktop: false,
  monitor_documents: false,
  custom_folders: [],
  notif_scan: true,
  notif_apply: true,
  notif_digest: false,
  notif_tips: true,
  notif_marketing: false,
  theme: 'light',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { setPrefs: setContextPrefs } = usePreferences()
  const [userName, setUserName] = useState('User')
  const [plan, setPlan] = useState<'free' | 'pro' | 'business'>('free')

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Custom folder input state
  const [showFolderInput, setShowFolderInput] = useState(false)
  const [folderInput, setFolderInput] = useState('')

  // License key input
  const [licenseKey, setLicenseKey] = useState('')

  // Blocklist state
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([])
  const [blocklistInput, setBlocklistInput] = useState('')
  const [blocklistReason, setBlocklistReason] = useState('')
  const [showBlocklistInput, setShowBlocklistInput] = useState(false)
  const [blocklistLoading, setBlocklistLoading] = useState(false)

  // Conventions state
  const [conventions, setConventions] = useState<Convention[]>([])
  const [conventionInput, setConventionInput] = useState('')
  const [showConventionInput, setShowConventionInput] = useState(false)
  const [conventionAdding, setConventionAdding] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (session) {
      setUserName(session.name)
      setPlan(session.plan ?? 'free')
    }

    apiGetPreferences()
      .then(p => setPrefs(p))
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false))

    apiGetBlocklist().then(setBlocklist).catch(() => {})
    apiGetConventions().then(setConventions).catch(() => {})
  }, [])

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs(prev => ({ ...prev, [key]: value }))
  }

  function handleThemeChange(theme: string) {
    update('theme', theme)
    // Expand from center of screen (no button origin here)
    document.documentElement.style.setProperty('--theme-x', '50%')
    document.documentElement.style.setProperty('--theme-y', '50%')
    const doSwitch = () => {
      if (theme === 'dark') document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
    }
    if ('startViewTransition' in document) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(document as any).startViewTransition(doSwitch)
    } else {
      doSwitch()
    }
  }

  function addCustomFolder() {
    const trimmed = folderInput.trim()
    if (!trimmed) return
    if (!prefs.custom_folders.includes(trimmed)) {
      update('custom_folders', [...prefs.custom_folders, trimmed])
    }
    setFolderInput('')
    setShowFolderInput(false)
  }

  function removeCustomFolder(folder: string) {
    update('custom_folders', prefs.custom_folders.filter(f => f !== folder))
  }

  async function addBlocklistEntry() {
    const path = blocklistInput.trim()
    if (!path) return
    setBlocklistLoading(true)
    try {
      const entry = await apiAddBlocklist(path, blocklistReason.trim() || undefined)
      setBlocklist(prev => [entry, ...prev])
      setBlocklistInput('')
      setBlocklistReason('')
      setShowBlocklistInput(false)
    } catch {}
    setBlocklistLoading(false)
  }

  async function removeBlocklistEntry(id: string) {
    await apiDeleteBlocklist(id).catch(() => {})
    setBlocklist(prev => prev.filter(e => e.id !== id))
  }

  async function addConvention() {
    const text = conventionInput.trim()
    if (!text) return
    setConventionAdding(true)
    try {
      const c = await apiAddConvention(text)
      setConventions(prev => [c, ...prev])
      setConventionInput('')
      setShowConventionInput(false)
    } catch {}
    setConventionAdding(false)
  }

  async function toggleConvention(id: string) {
    const updated = await apiToggleConvention(id).catch(() => null)
    if (updated) setConventions(prev => prev.map(c => c.id === id ? updated : c))
  }

  async function deleteConvention(id: string) {
    await apiDeleteConvention(id).catch(() => {})
    setConventions(prev => prev.filter(c => c.id !== id))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const saved = await apiSavePreferences(prefs)
      setPrefs(saved)
      setContextPrefs(saved)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your preferences, scan scope, and account settings.
        </p>
      </div>

      {/* ── Section 1: Preferences ── */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Preferences</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-0">

          {/* Naming convention */}
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Naming convention</Label>
            <Select
              value={prefs.naming_convention}
              onValueChange={v => update('naming_convention', v)}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-subject">Date first (2026-08-05_Invoice.pdf)</SelectItem>
                <SelectItem value="subject-date">Subject first (Invoice_2026-08-05.pdf)</SelectItem>
                <SelectItem value="keep-clean">Keep clean (Invoice.pdf)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />

          {/* Theme */}
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Theme</Label>
            <Select
              value={prefs.theme}
              onValueChange={handleThemeChange}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />

          {/* Auto-apply threshold */}
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Auto-apply threshold</Label>
            <Select
              value={String(prefs.auto_threshold)}
              onValueChange={v => update('auto_threshold', Number(v))}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.75">75% confidence</SelectItem>
                <SelectItem value="0.85">85% confidence (default)</SelectItem>
                <SelectItem value="0.9">90% confidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />

          {/* Review threshold */}
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Review threshold</Label>
            <Select
              value={String(prefs.review_threshold)}
              onValueChange={v => update('review_threshold', Number(v))}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.6">60% confidence</SelectItem>
                <SelectItem value="0.7">70% confidence (default)</SelectItem>
                <SelectItem value="0.8">80% confidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Scan Scope ── */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Scan Scope</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-0">

          {/* Downloads */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Downloads</p>
                <Badge className="text-[10px] h-4 px-1.5 bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/50">Auto-monitor coming soon</Badge>
              </div>
              <p className="text-xs text-muted-foreground">C:\Users\{userName}\Downloads</p>
            </div>
            <Switch checked={prefs.monitor_downloads} onCheckedChange={v => update('monitor_downloads', v)} />
          </div>
          <Separator />

          {/* Desktop */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Desktop</p>
                <Badge className="text-[10px] h-4 px-1.5 bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/50">Auto-monitor coming soon</Badge>
              </div>
              <p className="text-xs text-muted-foreground">C:\Users\{userName}\Desktop</p>
            </div>
            <Switch checked={prefs.monitor_desktop} onCheckedChange={v => update('monitor_desktop', v)} />
          </div>
          <Separator />

          {/* Documents */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Documents</p>
                <Badge className="text-[10px] h-4 px-1.5 bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/50">Auto-monitor coming soon</Badge>
              </div>
              <p className="text-xs text-muted-foreground">C:\Users\{userName}\Documents</p>
            </div>
            <Switch checked={prefs.monitor_documents} onCheckedChange={v => update('monitor_documents', v)} />
          </div>

          {/* Custom folders */}
          {prefs.custom_folders.length > 0 && (
            <>
              <Separator />
              <div className="py-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Custom folders</p>
                <div className="flex flex-wrap gap-2">
                  {prefs.custom_folders.map(folder => (
                    <div
                      key={folder}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-mono"
                    >
                      <span>{folder}</span>
                      <button
                        onClick={() => removeCustomFolder(folder)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Add custom folder */}
          <div className="pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFolderInput(prev => !prev)}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Add custom folder
            </Button>
            {showFolderInput && (
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="C:\Users\YourName\CustomFolder"
                  value={folderInput}
                  onChange={e => setFolderInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomFolder() }}
                  className="flex-1"
                  autoFocus
                />
                <Button variant="outline" size="sm" onClick={addCustomFolder}>
                  Add
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Safety & Blocklist ── */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Safety &amp; Blocklist</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-4">
          <div className="flex items-start gap-3 bg-muted rounded-lg p-3">
            <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Blocked paths are never scanned or modified by the AI.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Protected extensions (always)</p>
            <div className="flex flex-wrap gap-2">
              {PROTECTED_EXTENSIONS.map(ext => (
                <Badge key={ext} variant="secondary" className="font-mono text-xs">{ext}</Badge>
              ))}
            </div>
          </div>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">Custom blocked paths</p>
              <Button variant="outline" size="sm" onClick={() => setShowBlocklistInput(p => !p)}>
                <Plus className="size-3 mr-1" />Add path
              </Button>
            </div>
            {showBlocklistInput && (
              <div className="mb-3 space-y-2">
                <Input
                  placeholder="C:\Users\YourName\SensitiveFolder"
                  value={blocklistInput}
                  onChange={e => setBlocklistInput(e.target.value)}
                  className="font-mono text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Reason (optional)"
                    value={blocklistReason}
                    onChange={e => setBlocklistReason(e.target.value)}
                    className="text-sm flex-1"
                  />
                  <Button size="sm" onClick={addBlocklistEntry} disabled={blocklistLoading || !blocklistInput.trim()}>
                    {blocklistLoading ? <Loader2 className="size-3 animate-spin" /> : 'Block'}
                  </Button>
                </div>
              </div>
            )}
            {blocklist.length === 0 ? (
              <p className="text-xs text-muted-foreground">No custom blocked paths.</p>
            ) : (
              <div className="space-y-1.5">
                {blocklist.map(entry => (
                  <div key={entry.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                    <span className="font-mono text-xs text-foreground flex-1 truncate">{entry.path}</span>
                    {entry.reason && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{entry.reason}</span>}
                    <button onClick={() => removeBlocklistEntry(entry.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Section: Conventions ── */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Organisation Conventions</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-4">
          <div className="flex items-start gap-3 bg-muted rounded-lg p-3">
            <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Natural language rules the AI must always follow. Stated rules outrank inferences.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">Your rules</p>
              <Button variant="outline" size="sm" onClick={() => setShowConventionInput(p => !p)}>
                <Plus className="size-3 mr-1" />Add rule
              </Button>
            </div>
            {showConventionInput && (
              <div className="mb-3 flex gap-2">
                <Input
                  placeholder='e.g. "Put all invoices in Finance/Invoices/2026"'
                  value={conventionInput}
                  onChange={e => setConventionInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addConvention() }}
                  className="text-sm flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={addConvention} disabled={conventionAdding || !conventionInput.trim()}>
                  {conventionAdding ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
                </Button>
              </div>
            )}
            {conventions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No conventions yet. Add your first rule above.</p>
            ) : (
              <div className="space-y-1.5">
                {conventions.map(c => (
                  <div key={c.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${c.active ? 'border-border bg-card' : 'border-border/50 bg-muted/30 opacity-60'}`}>
                    <button onClick={() => toggleConvention(c.id)} className="shrink-0 text-muted-foreground hover:text-primary">
                      {c.active ? <ToggleRight className="size-4 text-primary" /> : <ToggleLeft className="size-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{c.rule_text}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground capitalize">{c.source}</span>
                        {c.scope !== 'global' && <span className="text-[10px] text-muted-foreground">{c.scope}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteConvention(c.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4: License & Subscription ── */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">License &amp; Subscription</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-4">
          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Current plan</p>
                <Badge variant="secondary">{plan === 'pro' ? 'Pro Plan' : 'Free Plan'}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {plan === 'pro'
                  ? 'Unlimited files, unlimited AI classifications'
                  : '500 files/month, 200 AI classifications'}
              </p>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">License key</Label>
            <div className="flex gap-2">
              <Input
                placeholder="MM-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value)}
                className="flex-1 font-mono"
              />
              <Button variant="outline" disabled={!licenseKey.trim()}>Activate</Button>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-1">
            <p className="text-sm text-muted-foreground">
              {plan === 'pro' ? 'Pro plan active' : 'Free tier, no renewal required'}
            </p>
            {plan !== 'pro' && (
              <a href="/upgrade" className="text-sm text-primary hover:underline font-medium">
                Upgrade to Pro →
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 5: Notification Preferences ── */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Notification Preferences</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-0">
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Scan complete notifications</Label>
            <Switch checked={prefs.notif_scan} onCheckedChange={v => update('notif_scan', v)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Batch applied notifications</Label>
            <Switch checked={prefs.notif_apply} onCheckedChange={v => update('notif_apply', v)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Weekly insights digest</Label>
            <Switch checked={prefs.notif_digest} onCheckedChange={v => update('notif_digest', v)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">New AI tips</Label>
            <Switch checked={prefs.notif_tips} onCheckedChange={v => update('notif_tips', v)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Marketing emails</Label>
            <Switch checked={prefs.notif_marketing} onCheckedChange={v => update('notif_marketing', v)} />
          </div>
        </CardContent>
      </Card>

      {/* ── Save button ── */}
      <div className="flex items-center gap-3 pb-6">
        <Button onClick={handleSave} disabled={saving || saved}>
          {saving
            ? <><Loader2 className="mr-2 size-4 animate-spin" />Saving…</>
            : saved
            ? <><CheckCircle2 className="mr-2 size-4" />Saved!</>
            : 'Save preferences'}
        </Button>
        {error && (
          <span className="text-sm text-destructive">{error}</span>
        )}
        {saved && !error && (
          <span className="text-sm text-muted-foreground">Your preferences have been saved.</span>
        )}
      </div>
    </div>
  )
}
