'use client'

import { Sun, Moon } from 'lucide-react'
import { usePreferences } from '@/lib/preferences-context'
import { applyTheme } from '@/lib/preferences-context'
import { apiSavePreferences } from '@/lib/api'

export function ThemeToggle() {
  const { prefs, setPrefs } = usePreferences()

  const isDark =
    prefs.theme === 'dark' ||
    (prefs.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const newTheme = isDark ? 'light' : 'dark'
    const newPrefs = { ...prefs, theme: newTheme }

    // Pin the origin so the CSS animation can expand from the button
    const rect = e.currentTarget.getBoundingClientRect()
    document.documentElement.style.setProperty('--theme-x', `${rect.left + rect.width / 2}px`)
    document.documentElement.style.setProperty('--theme-y', `${rect.top + rect.height / 2}px`)

    const doSwitch = () => {
      applyTheme(newTheme)
      setPrefs(newPrefs)
    }

    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(document as any).startViewTransition(doSwitch)
    } else {
      doSwitch()
    }

    // Persist silently — don't block the UI
    apiSavePreferences(newPrefs).catch(() => {})
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {/* Sun — visible in light mode */}
      <Sun
        className={`absolute size-4 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          isDark
            ? 'rotate-90 scale-0 opacity-0'
            : 'rotate-0 scale-100 opacity-100'
        }`}
      />
      {/* Moon — visible in dark mode */}
      <Moon
        className={`absolute size-4 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          isDark
            ? 'rotate-0 scale-100 opacity-100'
            : '-rotate-90 scale-0 opacity-0'
        }`}
      />
    </button>
  )
}
