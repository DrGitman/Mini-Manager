'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Sparkles,
  Filter,
  BarChart2,
  FileSearch,
  History,
  ShieldCheck,
  LogOut,
  FolderOpen,
  ArrowLeft,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { signOut } from '@/lib/session'
import { isDemoSession, clearDemoSession } from '@/lib/demo-session'

/**
 * Where "Back to the site" goes. Overridable because the marketing site and the
 * app are deployed separately and their hostnames are not derivable from here.
 */
const MARKETING_SITE =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://mini-manager-na.netlify.app'
import type { DemoUser } from '@/lib/types'

interface SidebarProps {
  user: DemoUser | null
  unreadCount?: number
}

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  // Read once on mount: sessionStorage is unavailable during the server render.
  const [isDemo, setIsDemo] = useState(false)
  useEffect(() => setIsDemo(isDemoSession()), [])
  const navItems: NavItem[] = [
    { label: 'Overview',   href: '/overview',    icon: LayoutDashboard },
    { label: 'Organize',   href: '/organize',    icon: Sparkles        },
    { label: 'Rules',      href: '/rules',       icon: Filter          },
    { label: 'Insights',   href: '/insights',    icon: BarChart2       },
    { label: 'Documents',  href: '/documents',   icon: FileSearch      },
    { label: 'History',    href: '/history',     icon: History         },
  ]

  function handleSignOut() {
    signOut()
    router.push('/login')
  }

  /**
   * Leave the demo.
   *
   * Clears the guest session so a shared machine does not hand the next person
   * a half-used demo, then returns to the marketing site. The server-side
   * ledger is untouched, which is the point: the allowance belongs to the
   * address, not to the tab.
   */
  function handleLeaveDemo() {
    signOut()
    clearDemoSession()
    window.location.href = MARKETING_SITE
  }

  function NavLink({ item }: { item: NavItem }) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

    return (
      <Link
        href={item.href}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-primary/8 text-primary font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <item.icon size={16} className="shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
    )
  }

  return (
    <aside className="flex h-full w-56 flex-col bg-sidebar border-r border-border">
      {/* Logo */}
      <div className="px-4 pt-5 pb-5">
        {/* Intrinsic size is the file's real 457x283. Passing a mismatched
            box (130x44) and then sizing with CSS is what triggers Next's
            aspect-ratio warning — let height drive it and width follow. */}
        <Image
          src="/logo-dark_blue-full.png"
          alt="Mini Manager"
          width={457}
          height={283}
          className="h-10 w-auto object-contain object-left"
          priority
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-0.5">
          {navItems.map(item => <li key={item.href}><NavLink item={item} /></li>)}
        </ul>
      </nav>

      {/* Scan CTA */}
      <div className="px-3 pb-3">
        <button
          onClick={() => router.push('/organize')}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <FolderOpen size={15} />
          Scan a folder
        </button>
      </div>

      {/*
        Sign out, or leave the demo.

        A guest has no account to sign out of, so the button used to drop them
        on a login screen they could never get past — a dead end in the one
        place a judge is most likely to click. It sends them back to the site
        instead.

        Leaving does not refund anything. The action ledger is keyed to the
        address in Postgres, not to the browser session, so reopening the demo
        resumes the same allowance rather than granting a new one.
      */}
      <div className="border-t border-border px-3 py-2">
        {isDemo ? (
          <button
            onClick={handleLeaveDemo}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={13} />
            Back to the site
          </button>
        ) : (
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut size={13} />
            Sign out
          </button>
        )}
      </div>
    </aside>
  )
}
