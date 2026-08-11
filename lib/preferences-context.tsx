'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { apiGetPreferences, type Preferences } from './api'

const DEFAULT: Preferences = {
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
  notif_scan: true,
  notif_apply: true,
  notif_digest: false,
  notif_tips: true,
  notif_marketing: false,
  theme: 'light',
}

interface PreferencesContextValue {
  prefs: Preferences
  setPrefs: (p: Preferences) => void
}

const PreferencesContext = createContext<PreferencesContextValue>({
  prefs: DEFAULT,
  setPrefs: () => {},
})

export function applyTheme(theme: string) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.remove('dark')
  }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<Preferences>(DEFAULT)

  useEffect(() => {
    apiGetPreferences()
      .then(p => {
        setPrefsState(p)
        applyTheme(p.theme)
      })
      .catch(() => {/* use defaults */})
  }, [])

  function setPrefs(p: Preferences) {
    setPrefsState(p)
    applyTheme(p.theme)
  }

  return (
    <PreferencesContext.Provider value={{ prefs, setPrefs }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext)
}
