'use client'

import { useEffect, useState } from 'react'
import {
  Settings2,
  Shield,
  Bell,
  CreditCard,
  FolderPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { getSession } from '@/lib/session'
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/lib/types'

const BLOCKED_PATHS = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\$Recycle.Bin',
]

const PROTECTED_EXTENSIONS = ['.exe', '.dll', '.sys', '.msi', '.bat', '.cmd']

export default function SettingsPage() {
  const [userName, setUserName] = useState('User')
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES)

  // Scan scope
  const [monitorDownloads, setMonitorDownloads] = useState(true)
  const [monitorDesktop, setMonitorDesktop] = useState(true)
  const [monitorDocuments, setMonitorDocuments] = useState(false)
  const [showCustomFolder, setShowCustomFolder] = useState(false)
  const [customFolder, setCustomFolder] = useState('')

  // Notifications
  const [notifScanComplete, setNotifScanComplete] = useState(true)
  const [notifBatchApplied, setNotifBatchApplied] = useState(true)
  const [notifWeeklyDigest, setNotifWeeklyDigest] = useState(false)
  const [notifAiTips, setNotifAiTips] = useState(true)
  const [notifMarketing, setNotifMarketing] = useState(false)

  // License
  const [licenseKey, setLicenseKey] = useState('')

  // Toast
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (session) {
      setUserName(session.name)
    }
  }, [])

  function setPref<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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

      {/* Section 1: Preferences */}
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
              value={prefs.namingConvention}
              onValueChange={(v) =>
                setPref('namingConvention', v as UserPreferences['namingConvention'])
              }
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
              onValueChange={(v) => setPref('theme', v as UserPreferences['theme'])}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />

          {/* Auto-apply threshold */}
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Auto-apply threshold</Label>
            <Select
              value={String(prefs.autoApplyThreshold)}
              onValueChange={(v) => setPref('autoApplyThreshold', Number(v))}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.85">85% confidence (default)</SelectItem>
                <SelectItem value="0.90">90% confidence</SelectItem>
                <SelectItem value="0.75">75% confidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />

          {/* Review threshold */}
          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Review threshold</Label>
            <Select
              value={String(prefs.reviewThreshold)}
              onValueChange={(v) => setPref('reviewThreshold', Number(v))}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.70">70% confidence (default)</SelectItem>
                <SelectItem value="0.60">60% confidence</SelectItem>
                <SelectItem value="0.80">80% confidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Scan Scope */}
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
              <p className="text-sm font-medium text-foreground">Downloads</p>
              <p className="text-xs text-muted-foreground">
                C:\Users\{userName}\Downloads — Your main download location
              </p>
            </div>
            <Switch checked={monitorDownloads} onCheckedChange={setMonitorDownloads} />
          </div>
          <Separator />

          {/* Desktop */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Desktop</p>
              <p className="text-xs text-muted-foreground">
                C:\Users\{userName}\Desktop — Files saved to desktop
              </p>
            </div>
            <Switch checked={monitorDesktop} onCheckedChange={setMonitorDesktop} />
          </div>
          <Separator />

          {/* Documents */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Documents</p>
              <p className="text-xs text-muted-foreground">
                C:\Users\{userName}\Documents — Document library
              </p>
            </div>
            <Switch checked={monitorDocuments} onCheckedChange={setMonitorDocuments} />
          </div>
          <Separator />

          {/* Add custom folder */}
          <div className="pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCustomFolder((prev) => !prev)}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Add custom folder
            </Button>
            {showCustomFolder && (
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="C:\Users\YourName\CustomFolder"
                  value={customFolder}
                  onChange={(e) => setCustomFolder(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" size="sm">
                  Add
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Safety & Blocklist */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Safety &amp; Blocklist</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-4">
          {/* Info box */}
          <div className="flex items-start gap-3 bg-muted rounded-lg p-3">
            <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              These paths are always protected and will never be scanned or modified.
            </p>
          </div>

          {/* Blocked paths */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Protected paths</p>
            <div className="flex flex-wrap gap-2">
              {BLOCKED_PATHS.map((path) => (
                <Badge key={path} variant="secondary" className="font-mono text-xs">
                  {path}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Protected extensions */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Protected extensions</p>
            <div className="flex flex-wrap gap-2">
              {PROTECTED_EXTENSIONS.map((ext) => (
                <Badge key={ext} variant="secondary" className="font-mono text-xs">
                  {ext}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: License & Subscription */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">License &amp; Subscription</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-4">
          {/* Current plan */}
          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Current plan</p>
                <Badge variant="secondary">Free Plan</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                500 files/month, 200 AI classifications
              </p>
            </div>
          </div>

          <Separator />

          {/* License key */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">License key</Label>
            <div className="flex gap-2">
              <Input
                placeholder="MM-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                className="flex-1 font-mono"
              />
              <Button variant="outline">Activate</Button>
            </div>
          </div>

          <Separator />

          {/* Renewal */}
          <div className="flex items-center justify-between py-1">
            <p className="text-sm text-muted-foreground">Free tier — no renewal required</p>
            <a href="/upgrade" className="text-sm text-primary hover:underline font-medium">
              Upgrade to Pro →
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Notifications */}
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
            <Switch checked={notifScanComplete} onCheckedChange={setNotifScanComplete} />
          </div>
          <Separator />

          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Batch applied notifications</Label>
            <Switch checked={notifBatchApplied} onCheckedChange={setNotifBatchApplied} />
          </div>
          <Separator />

          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Weekly insights digest</Label>
            <Switch checked={notifWeeklyDigest} onCheckedChange={setNotifWeeklyDigest} />
          </div>
          <Separator />

          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">New AI tips</Label>
            <Switch checked={notifAiTips} onCheckedChange={setNotifAiTips} />
          </div>
          <Separator />

          <div className="flex items-center justify-between py-3">
            <Label className="text-sm font-medium text-foreground">Marketing emails</Label>
            <Switch checked={notifMarketing} onCheckedChange={setNotifMarketing} />
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex items-center gap-3 pb-6">
        <Button onClick={handleSave} disabled={saved}>
          {saved ? 'Saved!' : 'Save preferences'}
        </Button>
        {saved && (
          <span className="text-sm text-muted-foreground">Your preferences have been saved.</span>
        )}
      </div>
    </div>
  )
}
