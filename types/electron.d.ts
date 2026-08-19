/**
 * The bridge Electron exposes to the renderer (see electron/preload.js).
 *
 * Undefined in a browser — always check before calling, e.g.
 *   if (window.electronAPI?.runOperations) { ... }
 */
import type { AgentOperation, AgentOpResult } from '@/lib/api'

/** One file as the native scanner reports it. */
export interface ScannedFile {
  id?: string
  name: string
  extension: string
  relativePath?: string
  absolutePath?: string
  sizeBytes?: number
  modifiedAt?: number
}

export interface UserPaths {
  home: string | null
  downloads: string | null
  desktop: string | null
  documents: string | null
}

export interface ElectronAPI {
  /** Always true when running in the desktop app. */
  isElectron: boolean
  openDirectoryPicker: () => Promise<string | null>
  scanDirectory: (dirPath: string) => Promise<{ files: ScannedFile[]; folders: unknown[] }>
  /** Real Downloads/Desktop/Documents paths — never guess these from a username. */
  getUserPaths: () => Promise<UserPaths>
  /** Desktop notification. Returns whether it was actually shown. */
  showNotification: (opts: { title: string; body?: string }) =>
    Promise<{ shown: boolean; reason?: string }>
  /** Verify a folder is real and readable before saving it to the scan scope. */
  pathExists: (dirPath: string) => Promise<{ ok: boolean; error?: string }>
  moveFile: (fromPath: string, toPath: string) => Promise<void>
  renameFolder: (oldAbsPath: string, newAbsPath: string) => Promise<void>
  /** Sends to the OS Recycle Bin — recoverable, not a real delete. */
  trashFile: (filePath: string) => Promise<void>
  /** Runs AI-planned operations on this machine. */
  runOperations: (operations: AgentOperation[]) => Promise<AgentOpResult[]>
  platform: string
  googleAuthStart: (opts?: { intent?: 'login' | 'signup'; apiBase?: string }) => Promise<void>
  onGoogleAuthSuccess: (cb: (data: Record<string, string>) => void) => void
  removeGoogleAuthListener?: () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
