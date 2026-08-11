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
  Lock,
  LogOut,
  FolderOpen,
} from 'lucide-react'
import { signOut } from '@/lib/session'
import type { DemoUser } from '@/lib/types'

interface SidebarProps {
  user: DemoUser | null
  unreadCount?: number
}

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  pro?: boolean
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const plan = user?.plan ?? 'free'
  const isPro = plan === 'pro' || plan === 'business'

  const navItems: NavItem[] = [
    { label: 'Overview',   href: '/overview',    icon: LayoutDashboard },
    { label: 'Organize',   href: '/organize',    icon: Sparkles        },
    { label: 'Rules',      href: '/rules',       icon: Filter,         pro: true },
    { label: 'Insights',   href: '/insights',    icon: BarChart2,      pro: true },
    { label: 'Documents',  href: '/documents',   icon: FileSearch      },
    { label: 'History',    href: '/history',     icon: History,        pro: true },
  ]

  function handleNavClick(item: NavItem, e: React.MouseEvent) {
    if (item.pro && !isPro) {
      e.preventDefault()
      router.push('/upgrade')
    }
  }

  function handleSignOut() {
    signOut()
    router.push('/login')
  }

  function NavLink({ item }: { item: NavItem }) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    const locked = item.pro && !isPro

    return (
      <Link
        href={locked ? '/upgrade' : item.href}
        onClick={(e) => handleNavClick(item, e)}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-primary/8 text-primary font-medium'
            : locked
            ? 'text-muted-foreground/30 cursor-pointer hover:text-muted-foreground/50'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <item.icon size={16} className="shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {locked && <Lock size={12} className="shrink-0 text-muted-foreground/30" />}
      </Link>
    )
  }

  return (
    <aside className="flex h-full w-56 flex-col bg-sidebar border-r border-border">
      {/* Logo */}
      <div className="px-4 pt-5 pb-5">
        <Image
          src="/logo-dark_blue-full.png"
          alt="Mini Manager"
          width={130}
          height={44}
          className="object-contain object-left"
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

      {/* Sign out */}
      <div className="border-t border-border px-3 py-2">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
