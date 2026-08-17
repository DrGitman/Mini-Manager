/**
 * The bridge Electron exposes to the renderer (see electron/preload.js).
 *
 * Undefined in a browser — always check before calling, e.g.
 *   if (window.electronAPI?.runOperations) { ... }
 */
import type { AgentOperation, AgentOpResult } from '@/lib/api'

export interface ElectronAPI {
  openDirectoryPicker: () => Promise<string | null>
  scanDirectory: (dirPath: string) => Promise<{ files: unknown[]; folders: unknown[] }>
  moveFile: (fromPath: string, toPath: string) => Promise<void>
  renameFolder: (oldAbsPath: string, newAbsPath: string) => Promise<void>
  /** Sends to the OS Recycle Bin — recoverable, not a real delete. */
  trashFile: (filePath: string) => Promise<void>
  /** Runs AI-planned operations on this machine. */
  runOperations: (operations: AgentOperation[]) => Promise<AgentOpResult[]>
  platform: string
  googleAuthStart: () => Promise<void>
  onGoogleAuthSuccess: (cb: (data: Record<string, string>) => void) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
