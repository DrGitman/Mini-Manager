'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, Lock, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { getSession, updateUser, signOut } from '@/lib/session'
import {
  apiGetProfile,
  apiUpdateProfile,
  apiChangePassword,
  apiSignOutAllDevices,
  apiDeleteAccount,
} from '@/lib/api'
import type { DemoUser } from '@/lib/types'

/**
 * Downscale an image file to a square data: URL so avatars stay small enough
 * to store inline (the API rejects anything over ~200 KB).
 */
function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.onload = () => {
      const img = new window.Image()
      img.onerror = () => reject(new Error('That file is not a valid image'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Could not process that image'))
        // Cover-crop: scale the shorter edge to fill, then centre.
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export default function ProfilePage() {
  const [user, setUser] = useState<DemoUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Form fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [bio, setBio] = useState('')

  // Save state
  const [saving, setSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Change password
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  // Avatar
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  // Sign out all devices
  const [signingOutAll, setSigningOutAll] = useState(false)

  // Delete account
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const router = useRouter()

  // Real signup date from the backend; falls back to the session value.
  const [joinedAt, setJoinedAt] = useState<number | null>(null)

  useEffect(() => {
    const session = getSession()
    if (session) {
      setUser(session)
      setFullName(session.name)
      setEmail(session.email)
      setJoinedAt(session.joinedAt)
    }

    // Enrich from backend — this is the source of truth for the profile fields.
    apiGetProfile()
      .then(profile => {
        setFullName(profile.name)
        setEmail(profile.email)
        setCompany(profile.company ?? '')
        setLocation(profile.location ?? '')
        setBio(profile.bio ?? '')
        setAvatarUrl(profile.avatar_url ?? null)
        if (profile.created_at) setJoinedAt(new Date(profile.created_at).getTime())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSaveProfile() {
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await apiUpdateProfile({
        name: fullName,
        company: company.trim() || null,
        location: location.trim() || null,
        bio: bio.trim() || null,
      })
      // Reflect exactly what was persisted
      setFullName(updated.name)
      setCompany(updated.company ?? '')
      setLocation(updated.location ?? '')
      setBio(updated.bio ?? '')
      // Sync local session (name drives the sidebar avatar + initials)
      const next = updateUser({ name: updated.name })
      if (next) setUser(next)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2500)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordConfirm() {
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters')
      return
    }
    setPasswordSaving(true)
    setPasswordError(null)
    try {
      await apiChangePassword(oldPassword, newPassword)
      setShowPasswordDialog(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
      setTimeout(() => setPasswordSaved(false), 2500)
    } catch (e: unknown) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  function handleClosePasswordDialog() {
    setShowPasswordDialog(false)
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError(null)
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return

    setAvatarError(null)
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file')
      return
    }

    setAvatarSaving(true)
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      const updated = await apiUpdateProfile({ avatar_url: dataUrl })
      setAvatarUrl(updated.avatar_url ?? null)
      const next = updateUser({ avatarUrl: updated.avatar_url ?? null })
      if (next) setUser(next)
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : 'Could not update photo')
    } finally {
      setAvatarSaving(false)
    }
  }

  async function handleRemoveAvatar() {
    setAvatarError(null)
    setAvatarSaving(true)
    try {
      await apiUpdateProfile({ avatar_url: null })
      setAvatarUrl(null)
      const next = updateUser({ avatarUrl: null })
      if (next) setUser(next)
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : 'Could not remove photo')
    } finally {
      setAvatarSaving(false)
    }
  }

  async function handleSignOutAllDevices() {
    setSigningOutAll(true)
    try {
      await apiSignOutAllDevices()
    } catch {
      // Even if the call fails, clearing locally is the safer outcome.
    } finally {
      // This token is revoked too, so the local session must go.
      signOut()
      router.push('/login')
    }
  }

  async function handleDeleteConfirm() {
    // Don't demand a password here — Google accounts don't have one, and the
    // server decides what confirmation it needs. Blocking client-side made it
    // impossible for those users to delete their account at all.
    setDeleting(true)
    setDeleteError(null)
    try {
      await apiDeleteAccount(deletePassword)
      signOut()
      router.push('/signup')
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete account')
      setDeleting(false)
    }
  }

  function handleCloseDeleteDialog() {
    setShowDeleteDialog(false)
    setDeletePassword('')
    setDeleteError(null)
  }

  const initials = user?.avatarInitials ?? 'U'
  const joinedDate = joinedAt
    ? new Date(joinedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
      </div>

      {/* Profile card */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <div className="relative h-16 w-16 shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data: URL, no loader needed
                <img
                  src={avatarUrl}
                  alt="Profile photo"
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-xl font-semibold text-primary-foreground">{initials}</span>
                </div>
              )}
              {avatarSaving && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                  <Loader2 className="size-5 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-6 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-56 animate-pulse rounded bg-muted" />
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-foreground truncate">{user?.name ?? '—'}</h2>
                  <p className="text-sm text-muted-foreground truncate">{user?.email ?? '—'}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {user?.plan === 'pro' ? (
                      <Badge className="bg-primary text-primary-foreground">Pro</Badge>
                    ) : (
                      <Badge variant="secondary">Free</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">Member since {joinedDate}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarPick}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                {avatarUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={avatarSaving}
                    className="text-muted-foreground"
                  >
                    Remove
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarSaving}
                >
                  {avatarSaving ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Edit photo'}
                </Button>
              </div>
              {avatarError && (
                <span className="text-xs text-destructive max-w-[200px] text-right">
                  {avatarError}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Personal Information</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="opacity-60 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="company" className="text-sm font-medium">Company</Label>
              <Input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Your company or organization"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location" className="text-sm font-medium">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Windhoek, Namibia"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio" className="text-sm font-medium">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              rows={3}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSaveProfile} disabled={saving || profileSaved}>
              {saving
                ? <><Loader2 className="mr-2 size-4 animate-spin" />Saving…</>
                : profileSaved
                ? 'Profile updated'
                : 'Save changes'}
            </Button>
            {profileSaved && (
              <span className="text-sm text-muted-foreground">Changes saved successfully.</span>
            )}
            {saveError && (
              <span className="text-sm text-destructive">{saveError}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="bg-card border border-border rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Security</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-0">
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Password</p>
              <p className="text-xs text-muted-foreground">
                {passwordSaved ? 'Password updated successfully.' : 'Update your account password.'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(true)}>
              Change Password
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Active sessions</p>
              <p className="text-xs text-muted-foreground">
                Signs you out everywhere, including this device.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={handleSignOutAllDevices}
              disabled={signingOutAll}
            >
              {signingOutAll
                ? <><Loader2 className="mr-2 size-4 animate-spin" />Signing out…</>
                : 'Sign out all devices'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-card border border-destructive/30 rounded-lg shadow-sm">
        <CardHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <h2 className="text-base font-semibold text-foreground">Danger Zone</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Delete Account</p>
              <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={handleClosePasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="oldPassword" className="text-sm font-medium">Current Password</Label>
              <Input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="text-sm font-medium">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClosePasswordDialog}>Cancel</Button>
            <Button onClick={handlePasswordConfirm} disabled={passwordSaving}>
              {passwordSaving
                ? <><Loader2 className="mr-2 size-4 animate-spin" />Updating…</>
                : 'Update Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account AlertDialog */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={open => (open ? setShowDeleteDialog(true) : handleCloseDeleteDialog())}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Your account, scan history, rules and undo journal
              will be permanently deleted. Enter your password to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="deletePassword" className="text-sm font-medium">Password</Label>
            <Input
              id="deletePassword"
              type="password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault() // keep the dialog open if the password is wrong
                handleDeleteConfirm()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? <><Loader2 className="mr-2 size-4 animate-spin" />Deleting…</>
                : 'Delete Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
