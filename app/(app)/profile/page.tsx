'use client'

import { useEffect, useState } from 'react'
import { User, Lock, Trash2 } from 'lucide-react'
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
import { getSession, updateUser } from '@/lib/session'
import type { DemoUser } from '@/lib/types'

export default function ProfilePage() {
  const [user, setUser] = useState<DemoUser | null>(null)

  // Personal info form
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [bio, setBio] = useState('')

  // Toast states
  const [profileSaved, setProfileSaved] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)

  // Change password dialog
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Delete account dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (session) {
      setUser(session)
      setFullName(session.name)
      setEmail(session.email)
    }
  }, [])

  function handleSaveProfile() {
    const updated = updateUser({ name: fullName })
    if (updated) setUser(updated)
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  function handlePasswordConfirm() {
    setShowPasswordDialog(false)
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordSaved(true)
    setTimeout(() => setPasswordSaved(false), 2000)
  }

  function handleDeleteConfirm() {
    setShowDeleteDialog(false)
    // Cosmetic — no actual deletion
  }

  const initials = user?.avatarInitials ?? 'U'
  const joinedDate = user
    ? new Date(user.joinedAt).toLocaleDateString('en-US', {
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
            {/* Avatar */}
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-xl font-semibold text-primary-foreground">{initials}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-foreground truncate">
                {user?.name ?? '—'}
              </h2>
              <p className="text-sm text-muted-foreground truncate">{user?.email ?? '—'}</p>
              <div className="flex items-center gap-3 mt-1.5">
                {user?.plan === 'pro' ? (
                  <Badge className="bg-primary text-primary-foreground">Pro</Badge>
                ) : (
                  <Badge variant="secondary">Free</Badge>
                )}
                <span className="text-xs text-muted-foreground">Member since {joinedDate}</span>
              </div>
            </div>

            {/* Edit photo (cosmetic) */}
            <Button variant="outline" size="sm">
              Edit photo
            </Button>
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
              <Label htmlFor="fullName" className="text-sm font-medium">
                Full Name
              </Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="company" className="text-sm font-medium">
                Company
              </Label>
              <Input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Your company or organization"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location" className="text-sm font-medium">
                Location
              </Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Windhoek, Namibia"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio" className="text-sm font-medium">
              Bio
            </Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              rows={3}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSaveProfile} disabled={profileSaved}>
              {profileSaved ? 'Profile updated' : 'Save changes'}
            </Button>
            {profileSaved && (
              <span className="text-sm text-muted-foreground">Changes saved successfully.</span>
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
          {/* Change password row */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Password</p>
              <p className="text-xs text-muted-foreground">
                {passwordSaved ? 'Password updated successfully.' : 'Update your account password.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPasswordDialog(true)}
            >
              Change Password
            </Button>
          </div>
          <Separator />

          {/* Active sessions row */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Active sessions</p>
              <p className="text-xs text-muted-foreground">1 active session (this device)</p>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Sign out all devices
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
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and all data
              </p>
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
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="oldPassword" className="text-sm font-medium">
                Old Password
              </Label>
              <Input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="text-sm font-medium">
                New Password
              </Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm New Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handlePasswordConfirm}>Update Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account AlertDialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Your account and all associated data will be permanently
              deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
