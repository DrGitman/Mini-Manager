/**
 * Mini Manager – Electron main process
 * Loads the Next.js app and provides native file-system IPC handlers.
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage, session } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const isDev = !app.isPackaged

// ─── Text extensions we can read for content previews ─────────────────────────
const TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.log', '.yaml', '.yml',
  '.xml', '.html', '.htm', '.js', '.ts', '.jsx', '.tsx', '.py', '.css',
  '.ini', '.cfg', '.conf', '.toml', '.env', '.sh', '.bat', '.sql',
])

// ─── Window ──────────────────────────────────────────────────────────────────

let mainWindow = null

function createWindow() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,            // needed so preload can use require
      webSecurity: true,
    },
    titleBarStyle: 'default',
    backgroundColor: '#ffffff',
    show: false,
    autoHideMenuBar: true,
  })

  const devUrl = 'http://localhost:3000'

  if (isDev) {
    mainWindow.loadURL(devUrl)
  } else {
    // In production, Next.js is started as a child process on port 3333 (see below)
    mainWindow.loadURL('http://localhost:3333')
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.on('closed', () => { mainWindow = null })

  // Remove default menu in production
  if (!isDev) Menu.setApplicationMenu(null)
}

// ─── Single instance lock ─────────────────────────────────────────────────────

// ─── Custom protocol (Google OAuth callback) ──────────────────────────────────
app.setAsDefaultProtocolClient('minimanager')

function handleProtocolUrl(url) {
  try {
    // minimanager://auth?token=...&email=...&name=...&plan=...&user_id=...
    const parsed = new URL(url)
    if (parsed.hostname === 'auth') {
      const data = Object.fromEntries(parsed.searchParams.entries())
      if (data.token && mainWindow) {
        mainWindow.webContents.send('google-auth-success', data)
        mainWindow.focus()
      }
    }
  } catch (e) {
    console.error('Failed to parse protocol URL:', url, e)
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine) => {
    // On Windows, the protocol URL comes in as a command-line argument
    const url = commandLine.find(arg => arg.startsWith('minimanager://'))
    if (url) handleProtocolUrl(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// macOS
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleProtocolUrl(url)
})

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Electron denies media permission by default, which blocks the microphone
  // before voice input can even start. Allow only what the app actually needs.
  const ALLOWED_PERMISSIONS = new Set(['media', 'audioCapture', 'clipboard-read'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  )

  // Set app icon (Windows taskbar / Linux dock)
  const appIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))
  if (process.platform === 'linux') app.setIcon(appIcon)
  if (!isDev) startNextServer()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── Production: spawn Next.js standalone server ──────────────────────────────

let nextServerProcess = null

function startNextServer() {
  const serverPath = path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js')
  if (!fs.existsSync(serverPath)) {
    console.error('Standalone server not found at', serverPath)
    return
  }
  nextServerProcess = require('child_process').fork(serverPath, [], {
    env: { ...process.env, PORT: '3333', NODE_ENV: 'production' },
    silent: true,
  })
  nextServerProcess.on('error', err => console.error('Next.js server error:', err))
}

app.on('before-quit', () => {
  if (nextServerProcess) {
    nextServerProcess.kill()
    nextServerProcess = null
  }
})

// ─── IPC: Open directory picker ───────────────────────────────────────────────

ipcMain.handle('open-directory-picker', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select folder to scan',
    buttonLabel: 'Scan this folder',
  })
  return result.canceled ? null : result.filePaths[0]
})

// ─── IPC: Recursive directory scan ───────────────────────────────────────────

function walkDir(dirPath, relPath, files, folders, maxFiles) {
  if (files.length >= maxFiles) return

  let entries
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return // skip dirs we can't read
  }

  for (const entry of entries) {
    if (files.length >= maxFiles) break
    // Skip hidden files/dirs (dot-prefixed)
    if (entry.name.startsWith('.')) continue

    const fullPath = path.join(dirPath, entry.name)
    const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      folders.push(entryRelPath)
      walkDir(fullPath, entryRelPath, files, folders, maxFiles)
    } else if (entry.isFile()) {
      let stat
      try { stat = fs.statSync(fullPath) } catch { continue }

      const ext = path.extname(entry.name).toLowerCase()
      let contentPreview = ''

      if (TEXT_EXTS.has(ext) && stat.size < 500_000) {
        try {
          const buf = Buffer.alloc(400)
          const fd = fs.openSync(fullPath, 'r')
          const bytesRead = fs.readSync(fd, buf, 0, 400, 0)
          fs.closeSync(fd)
          contentPreview = buf.slice(0, bytesRead).toString('utf8').replace(/[\r\n]+/g, ' ').trim()
        } catch {
          // ignore unreadable files
        }
      }

      files.push({
        id: crypto.randomUUID(),
        name: entry.name,
        extension: ext,
        relativePath: entryRelPath,
        absolutePath: fullPath,
        sizeBytes: stat.size,
        modifiedAt: Math.round(stat.mtimeMs),
        contentPreview,
      })
    }
  }
}

ipcMain.handle('scan-directory', async (_, dirPath) => {
  const files = []
  const folders = []
  walkDir(dirPath, '', files, folders, 500)
  return { files, folders }
})

// ─── IPC: Move file ───────────────────────────────────────────────────────────

ipcMain.handle('move-file', async (_, fromPath, toPath) => {
  fs.mkdirSync(path.dirname(toPath), { recursive: true })
  try {
    fs.renameSync(fromPath, toPath)
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Cross-device move: copy then delete
      fs.copyFileSync(fromPath, toPath)
      fs.unlinkSync(fromPath)
    } else {
      throw err
    }
  }
})

// ─── IPC: Rename folder ───────────────────────────────────────────────────────

ipcMain.handle('rename-folder', async (_, oldAbsPath, newAbsPath) => {
  // Ensure parent exists
  fs.mkdirSync(path.dirname(newAbsPath), { recursive: true })
  fs.renameSync(oldAbsPath, newAbsPath)
})

// ─── IPC: Trash file (Recycle Bin) ───────────────────────────────────────────

ipcMain.handle('trash-file', async (_, filePath) => {
  await shell.trashItem(filePath)
})

// ─── IPC: Google OAuth ────────────────────────────────────────────────────────

ipcMain.handle('google-auth-start', async () => {
  // Opens Google OAuth in the user's default browser
  // Backend redirects back to minimanager://auth?token=... when done
  await shell.openExternal('http://localhost:8000/api/v1/auth/google?mode=desktop')
})

// ─── IPC: Get platform info ───────────────────────────────────────────────────

ipcMain.handle('get-platform', () => process.platform)
