/**
 * Electron preload — bridges the main process file-system APIs into the renderer
 * via a safe contextBridge (contextIsolation = true, nodeIntegration = false).
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /** True when running inside Electron — lets the renderer switch code paths. */
  isElectron: true,

  /** Open a native OS folder picker. Returns the selected path or null if cancelled. */
  openDirectoryPicker: () =>
    ipcRenderer.invoke('open-directory-picker'),

  /**
   * Recursively scan a directory.
   * @returns {{ files: FileEntry[], folders: string[] }}
   *   FileEntry: { id, name, extension, relativePath, absolutePath, sizeBytes, modifiedAt, contentPreview }
   */
  scanDirectory: (dirPath) =>
    ipcRenderer.invoke('scan-directory', dirPath),

  /**
   * The user's real Downloads / Desktop / Documents paths.
   * @returns {{ home: string|null, downloads: string|null, desktop: string|null, documents: string|null }}
   */
  getUserPaths: () =>
    ipcRenderer.invoke('get-user-paths'),

  /**
   * Move/rename a file using native fs.rename (fast, atomic on same volume).
   * Automatically creates target directories.
   */
  moveFile: (fromPath, toPath) =>
    ipcRenderer.invoke('move-file', fromPath, toPath),

  /**
   * Rename a folder by absolute path. Uses fs.rename — instant on same volume.
   */
  renameFolder: (oldAbsPath, newAbsPath) =>
    ipcRenderer.invoke('rename-folder', oldAbsPath, newAbsPath),

  /**
   * Send a file to the OS Recycle Bin / Trash instead of permanently deleting it.
   */
  trashFile: (filePath) =>
    ipcRenderer.invoke('trash-file', filePath),

  /**
   * Execute AI-planned file operations on THIS machine.
   *
   * The agent plans on the server but the files are local, so execution has to
   * happen here — a hosted backend cannot see C:\Users\... at all.
   * Returns [{ op, status: 'done' | 'refused' | 'failed', detail }].
   */
  runOperations: (operations) =>
    ipcRenderer.invoke('run-operations', operations),

  /** Current OS platform: 'win32' | 'darwin' | 'linux' */
  platform: process.platform,

  /** Open Google OAuth in system browser (desktop flow → minimanager://auth callback) */
  googleAuthStart: () => ipcRenderer.invoke('google-auth-start'),

  /** Listen for Google OAuth success. Callback receives { token, user_id, email, name, plan } */
  onGoogleAuthSuccess: (callback) =>
    ipcRenderer.on('google-auth-success', (_event, data) => callback(data)),

  /** Remove the google-auth-success listener */
  removeGoogleAuthListener: () =>
    ipcRenderer.removeAllListeners('google-auth-success'),
})
