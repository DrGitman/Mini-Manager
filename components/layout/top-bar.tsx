'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Bell, Search, Settings, User, LogOut, Sparkles, FlaskConical } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { signOut } from '@/lib/session'
import { getDemoScansUsed, DEMO_LIMIT } from '@/lib/demo'
import type { DemoUser } from '@/lib/types'

const titles: Record<string, string> = {
  '/overview':      'Overview',
  '/organize':      'Organize Files',
  '/insights':      'Insights',
  '/safety':        'Safety',
  '/notifications': 'Notifications',
  '/settings':      'Settings',
  '/profile':       'Profile',
  '/upgrade':       'Upgrade',
}

function getTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname]
  const segment = '/' + (pathname.split('/').filter(Boolean)[0] ?? 'overview')
  return titles[segment] ?? segment.slice(1).charAt(0).toUpperCase() + segment.slice(2)
}

interface TopBarProps {
  unreadCount: number
  user: DemoUser | null
  aiOpen: boolean
  onAiToggle: () => void
}

export function TopBar({ unreadCount, user, aiOpen, onAiToggle }: TopBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const title = getTitle(pathname)
  const [scansUsed, setScansUsed] = useState(0)

  useEffect(() => {
    setScansUsed(getDemoScansUsed())
    const handler = () => setScansUsed(getDemoScansUsed())
    window.addEventListener('mm:demo-scan', handler)
    return () => window.removeEventListener('mm:demo-scan', handler)
  }, [])

  const initials = user?.avatarInitials ?? 'U'
  const name = user?.name ?? 'Guest'
  const email = user?.email ?? ''
  const expired = scansUsed >= DEMO_LIMIT

  function handleSignOut() {
    signOut()
    router.push('/login')
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-gray-100 bg-white px-6">
      {/* Page title */}
      <h1 className="text-base font-semibold text-gray-800 shrink-0">{title}</h1>

      {/* Demo badge */}
      <div className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        expired
          ? 'bg-red-50 text-red-600 border border-red-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}>
        <FlaskConical className="size-3" />
        {expired ? 'Demo expired' : `Demo · ${scansUsed}/${DEMO_LIMIT} scans`}
      </div>

      {/* Search */}
      <div className="flex flex-1 justify-center">
        <div className="relative w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search files..."
            className="h-8 rounded-lg border border-gray-200 bg-gray-50 pl-8 text-sm focus-visible:ring-1"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* AI Assistant toggle */}
        <button
          onClick={onAiToggle}
          title="AI Assistant"
          className={`flex size-8 items-center justify-center rounded-lg transition-colors ${
            aiOpen
              ? 'bg-primary text-white'
              : 'text-gray-400 hover:bg-gray-100 hover:text-primary'
          }`}
        >
          <Sparkles className="size-4" />
        </button>

        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative flex size-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button className="ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" />}
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-white text-xs">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
              <p className="text-xs text-gray-400 truncate">{email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/profile')}>
              <User className="size-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/settings')}>
              <Settings className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="flex items-center gap-2 cursor-pointer" onClick={handleSignOut}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
