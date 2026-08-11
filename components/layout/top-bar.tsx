'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { Bell, Settings, User, LogOut, Sparkles, FlaskConical, ScanLine, Undo2, ListPlus, BarChart3, Archive } from 'lucide-react'
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
import { apiSearch } from '@/lib/api'
import { formatBytes } from '@/lib/types'
import SearchBar, { type SearchResult } from '@/components/command-palette'
import type { DemoUser } from '@/lib/types'

const titles: Record<string, string> = {
  '/overview':     'Overview',
  '/organize':     'Organize Files',
  '/rules':        'Rules',
  '/insights':     'Insights',
  '/documents':    'Documents',
  '/explain':      'Documents',
  '/history':      'History',
  '/notifications':'Notifications',
  '/settings':     'Settings',
  '/profile':      'Profile',
  '/upgrade':      'Upgrade',
  '/agent':        'Agent',
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

const RECENTS_KEY = 'mm.palette.recents'

function loadRecents(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') } catch { return [] }
}

function saveRecents(r: string[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(RECENTS_KEY, JSON.stringify(r))
}

export function TopBar({ unreadCount, user, aiOpen, onAiToggle }: TopBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const title = getTitle(pathname)
  const [scansUsed, setScansUsed] = useState(0)
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    setScansUsed(getDemoScansUsed())
    setRecents(loadRecents())
    const handler = () => setScansUsed(getDemoScansUsed())
    window.addEventListener('mm:demo-scan', handler)
    return () => window.removeEventListener('mm:demo-scan', handler)
  }, [])

  function handleRecentsChange(next: string[]) {
    setRecents(next)
    saveRecents(next)
  }

  const commands: SearchResult[] = [
    {
      id: 'cmd-scan',
      kind: 'command',
      icon: ScanLine,
      label: 'Scan a folder',
      sublabel: 'Pick a folder and organize with AI',
      run: () => router.push('/organize'),
    },
    {
      id: 'cmd-undo',
      kind: 'command',
      icon: Undo2,
      label: 'Undo last batch',
      sublabel: 'Reverse recent file moves',
      run: () => router.push('/history'),
    },
    {
      id: 'cmd-rules',
      kind: 'command',
      icon: ListPlus,
      label: 'Add a rule',
      sublabel: 'Describe how files should be handled',
      run: () => router.push('/rules'),
    },
    {
      id: 'cmd-insights',
      kind: 'command',
      icon: BarChart3,
      label: 'View Insights',
      sublabel: 'Duplicates, stale files, space usage',
      run: () => router.push('/insights'),
    },
    {
      id: 'cmd-archive',
      kind: 'command',
      icon: Archive,
      label: 'Open Archive',
      sublabel: 'Restore or delete archived files',
      run: () => router.push('/history'),
    },
    {
      id: 'cmd-settings',
      kind: 'command',
      icon: Settings,
      label: 'Open Settings',
      run: () => router.push('/settings'),
    },
  ]

  const onSearch = useCallback(async (q: string): Promise<SearchResult[]> => {
    try {
      const data = await apiSearch(q)
      return [
        ...data.folders.map(f => ({
          id: `folder-${f.path}`,
          kind: 'folder' as const,
          label: f.path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? f.path,
          sublabel: f.path,
          meta: `${f.file_count} files`,
          run: () => router.push('/organize'),
        })),
        ...data.files.map(f => ({
          id: `file-${f.name}`,
          kind: 'file' as const,
          label: f.suggested_name || f.name,
          sublabel: f.target_folder || f.name,
          tags: f.category ? [f.category.toLowerCase()] : [],
          meta: f.size_bytes > 0 ? formatBytes(f.size_bytes) : undefined,
          run: () => router.push('/organize'),
        })),
      ]
    } catch {
      return []
    }
  }, [router])

  const initials = user?.avatarInitials ?? 'U'
  const name = user?.name ?? 'Guest'
  const email = user?.email ?? ''
  const expired = scansUsed >= DEMO_LIMIT

  function handleSignOut() {
    signOut()
    router.push('/login')
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-6">
      {/* Page title */}
      <h1 className="text-base font-semibold text-foreground shrink-0">{title}</h1>

      {/* Demo badge */}
      <div className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        expired
          ? 'bg-red-50 text-red-600 border border-red-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}>
        <FlaskConical className="size-3" />
        {expired ? 'Demo expired' : `Demo: ${scansUsed}/${DEMO_LIMIT} scans`}
      </div>

      {/* Search bar — anchored dropdown, no modal */}
      <div className="flex flex-1 justify-center">
        <SearchBar
          commands={commands}
          onSearch={onSearch}
          recents={recents}
          onRecentsChange={handleRecentsChange}
          placeholder="Search files..."
        />
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
              : 'text-muted-foreground hover:bg-accent hover:text-primary'
          }`}
        >
          <Sparkles className="size-4" />
        </button>

        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
              <p className="text-sm font-medium text-foreground truncate">{name}</p>
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/profile')}>
              <User className="size-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/settings')}>
              <Settings className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex items-center gap-2 cursor-pointer text-muted-foreground" onClick={handleSignOut}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
