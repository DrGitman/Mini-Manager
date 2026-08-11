'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Sparkles,
  BarChart2,
  ShieldCheck,
  Bell,
  Settings,
  Lock,
  LogOut,
  FolderOpen,
  Bot,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  badge?: number
}

export function Sidebar({ user, unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const plan = user?.plan ?? 'free'
  const isPro = plan === 'pro' || plan === 'business'

  const generalItems: NavItem[] = [
    { label: 'Overview', href: '/overview', icon: LayoutDashboard },
    { label: 'Settings', href: '/settings', icon: Settings },
  ]

  const mainItems: NavItem[] = [
    { label: 'Organize', href: '/organize', icon: Sparkles },
    { label: 'Agent', href: '/agent', icon: Bot },
    { label: 'Insights', href: '/insights', icon: BarChart2, pro: true },
    { label: 'Safety', href: '/safety', icon: ShieldCheck, pro: true },
  ]

  const accountItems: NavItem[] = [
    { label: 'Notifications', href: '/notifications', icon: Bell, badge: unreadCount },
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
            ? 'text-gray-300 cursor-pointer hover:text-gray-400'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
        }`}
      >
        <item.icon size={16} className="shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {locked && <Lock size={12} className="shrink-0 text-gray-300" />}
        {item.badge != null && item.badge > 0 && !locked && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {item.badge}
          </span>
        )}
      </Link>
    )
  }

  const initials = user?.avatarInitials ?? 'U'
  const name = user?.name ?? 'Guest'
  const email = user?.email ?? ''

  return (
    <aside className="flex h-full w-56 flex-col bg-white">
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
      <nav className="flex-1 overflow-y-auto px-3 space-y-4">
        <div>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">General</p>
          <ul className="space-y-0.5">
            {generalItems.map(item => <li key={item.href}><NavLink item={item} /></li>)}
          </ul>
        </div>

        <div>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Main menu</p>
          <ul className="space-y-0.5">
            {mainItems.map(item => <li key={item.href}><NavLink item={item} /></li>)}
          </ul>
        </div>

        <div>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Account</p>
          <ul className="space-y-0.5">
            {accountItems.map(item => <li key={item.href}><NavLink item={item} /></li>)}
          </ul>
        </div>
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
      <div className="border-t border-gray-100 px-3 py-2">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
