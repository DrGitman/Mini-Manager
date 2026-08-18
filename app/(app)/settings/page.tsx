'use client'

import { useEffect, useState } from 'react'
import {
  Settings2, Shield, Bell, CreditCard, FolderPlus, X, Loader2, CheckCircle2, BookOpen, Plus, ToggleLeft, ToggleRight, Pencil, Check, FolderSearch,
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
import { migrateLegacyMonitorFolders } from '@/lib/folder-digests'

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
  quick_scan_hidden: [],
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
  const [folderError, setFolderError] = useState<string | null>(null)
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  // Real paths from the OS. These were previously shown as
  // C:\Users\<first word of the display name>\Downloads, which is not where
  // most people's folders actually live.
  const [systemPaths, setSystemPaths] = useState<{ downloads?: string; desktop?: string; documents?: string }>({})

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.getUserPaths) return
    api.getUserPaths()
      .then(p => setSystemPaths({
        downloads: p.downloads ?? undefined,
        desktop: p.desktop ?? undefined,
        documents: p.documents ?? undefined,
      }))
      .catch(() => {})
  }, [])

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

    // Users whose scope came from the old Downloads/Desktop/Documents toggles
    // keep it: their real paths are written into custom_folders once.
    migrateLegacyMonitorFolders()
      .catch(() => [])
      .then(() => apiGetPreferences())
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

  /**
   * Add a folder to the scan scope.
   *
   * A typed path is checked first — an unreadable or misspelled one used to be
   * saved happily and then produce an empty scan, which reads as the app being
   * broken rather than as a typo.
   */
  async function addCustomFolder(pathToAdd?: string) {
    const trimmed = (pathToAdd ?? folderInput).trim()
    if (!trimmed) return
    setFolderError(null)

    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (api?.pathExists) {
      const check = await api.pathExists(trimmed)
      if (!check.ok) {
        setFolderError(check.error ?? 'That folder could not be opened.')
        return
      }
    }

    if (prefs.custom_folders.some(f => f.toLowerCase() === trimmed.toLowerCase())) {
      setFolderError('That folder is already in your scan scope.')
      return
    }

    update('custom_folders', [...prefs.custom_folders, trimmed])
    setFolderInput('')
    setShowFolderInput(false)
  }

  /** Pick a folder with the native browser instead of typing its path. */
  async function browseForFolder() {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.openDirectoryPicker) {
      setFolderError('Folder browsing needs the desktop app. Type the full path instead.')
      return
    }
    const picked = await api.openDirectoryPicker()
    if (picked) await addCustomFolder(picked)
  }

  function removeCustomFolder(folder: string) {
    update('custom_folders', prefs.custom_folders.filter(f => f !== folder))
    // Drop any hidden-flag for it too, so re-adding the folder later starts
    // from the default of being shown.
    update('quick_scan_hidden',
      (prefs.quick_scan_hidden ?? []).filter(f => f.toLowerCase() !== folder.toLowerCase()))
  }

  /**
   * Save an edited folder path, keeping its position and its Quick Scan setting.
   * The new path is checked the same way a newly added one is.
   */
  async function saveEditedFolder(original: string) {
    const next = editValue.trim()
    if (!next) return
    if (next === original) { setEditingFolder(null); return }
    setFolderError(null)

    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (api?.pathExists) {
      const check = await api.pathExists(next)
      if (!check.ok) {
        setFolderError(check.error ?? 'That folder could not be opened.')
        return
      }
    }
    if (prefs.custom_folders.some(f =>
      f.toLowerCase() === next.toLowerCase() && f.toLowerCase() !== original.toLowerCase())) {
      setFolderError('That folder is already in your scan scope.')
      return
    }

    update('custom_folders', prefs.custom_folders.map(f => (f === original ? next : f)))
    update('quick_scan_hidden',
      (prefs.quick_scan_hidden ?? []).map(f =>
        f.toLowerCase() === original.toLowerCase() ? next : f))
    setEditingFolder(null)
    setEditValue('')
  }

  /** Re-pick an existing entry with the native browser. */
  async function browseToReplace(original: string) {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.openDirectoryPicker) return
    const picked = await api.openDirectoryPicker()
    if (!picked) return
    setEditValue(picked)
    setEditingFolder(original)
  }

  /** Show or hide a folder in the Quick Scan shortcuts. It stays in scope either way. */
  function toggleQuickScan(folder: string, show: boolean) {
    const hidden = (prefs.quick_scan_hidden ?? []).filter(
      f => f.toLowerCase() !== folder.toLowerCase(),
    )
    update('quick_scan_hidden', show ? hidden : [...hidden, folder])
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

          <p className="text-xs text-muted-foreground pb-3">
            Mini Manager only looks at folders you add here. Everything in this
            list is scanned and can be searched or organised by the assistant.
          </p>

          {prefs.custom_folders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <FolderPlus className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-foreground">No folders yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add a folder below and it will show up in Quick Scan.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {prefs.custom_folders.map(folder => {
                const shown = !(prefs.quick_scan_hidden ?? []).some(
                  h => h.toLowerCase() === folder.toLowerCase(),
                )
                const isEditing = editingFolder === folder
                return (
                  <div key={folder} className="py-3">
                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={editValue}
                          onChange={e => { setEditValue(e.target.value); setFolderError(null) }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEditedFolder(folder)
                            if (e.key === 'Escape') { setEditingFolder(null); setFolderError(null) }
                          }}
                          className="flex-1 min-w-[220px] font-mono text-xs"
                          autoFocus
                        />
                        <Button variant="outline" size="sm" onClick={() => browseToReplace(folder)}>
                          <FolderSearch className="h-4 w-4 mr-1.5" />
                          Browse
                        </Button>
                        <Button size="sm" onClick={() => saveEditedFolder(folder)}>
                          <Check className="h-4 w-4 mr-1.5" />
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditingFolder(null); setFolderError(null) }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium text-foreground truncate">
                            {folder.split(/[\/]/).filter(Boolean).pop() ?? folder}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{folder}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Quick Scan</Label>
                            <Switch
                              checked={shown}
                              onCheckedChange={v => toggleQuickScan(folder, v)}
                            />
                          </div>
                          <button
                            onClick={() => { setEditingFolder(folder); setEditValue(folder); setFolderError(null) }}
                            aria-label={`Edit ${folder}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => removeCustomFolder(folder)}
                            aria-label={`Remove ${folder}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <Separator />

          {/* Add custom folder */}
          <div className="pt-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={browseForFolder}>
                <FolderPlus className="h-4 w-4 mr-2" />
                Browse for folder
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowFolderInput(prev => !prev); setFolderError(null) }}
              >
                Or type a path
              </Button>
            </div>
            {showFolderInput && (
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="D:\Projects\Client Work"
                  value={folderInput}
                  onChange={e => { setFolderInput(e.target.value); setFolderError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomFolder() }}
                  className="flex-1"
                  autoFocus
                />
                <Button variant="outline" size="sm" onClick={() => addCustomFolder()}>
                  Add
                </Button>
              </div>
            )}
            {folderError && (
              <p className="mt-2 text-xs text-destructive">{folderError}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Every folder here is scanned and can be searched or organised by the assistant.
            </p>
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
