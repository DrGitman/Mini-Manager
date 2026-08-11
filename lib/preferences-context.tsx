'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { apiGetPreferences, type Preferences } from './api'

const DEFAULT: Preferences = {
  naming_style: 'title',
  categories: ['Documents', 'Images', 'Videos', 'Audio', 'Code', 'Archives'],
  target_folder: 'Desktop',
  quarantine_mode: 'auto',
}

const PreferencesContext = createContext<Preferences>(DEFAULT)

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT)

  useEffect(() => {
    apiGetPreferences()
      .then(setPrefs)
      .catch(() => {/* use defaults */})
  }, [])

  return (
    <PreferencesContext.Provider value={prefs}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): Preferences {
  return useContext(PreferencesContext)
}
