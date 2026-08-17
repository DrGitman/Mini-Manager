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

// ─── IPC: Agent operations, executed on THIS machine ─────────────────────────
//
// The AI plans on the server, but the files live here. Running these in the
// backend only ever worked while it was on localhost — a hosted backend cannot
// see C:\Users\... at all.
//
// "delete" = Recycle Bin, which IS the quarantine: Windows already knows how to
// restore from it. "permanently delete" removes it outright, so it is not in the
// bin either.

const PROTECTED_FRAGMENTS = [
  'c:\\windows', 'c:\\program files', 'c:\\programdata',
  '\\appdata\\', '\\system32', '\\$recycle.bin',
  'node_modules', '\\.git\\', '\\venv\\', '\\.venv\\',
]

function isProtected(p) {
  const lower = String(p).toLowerCase().replace(/\//g, '\\')
  if (PROTECTED_FRAGMENTS.some(frag => lower.includes(frag))) return true
  // A bare drive root — "organise C:\" would otherwise walk the whole disk.
  return lower.replace(/\\+$/, '').length <= 2
}

const EXT_GROUPS = {
  Images:   ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.heic', '.tiff'],
  Videos:   ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.webm', '.m4v'],
  Audio:    ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a'],
  Documents:['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.odt'],
  Code:     ['.py', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.json', '.yml', '.sh', '.java', '.go', '.rs'],
  Archives: ['.zip', '.rar', '.7z', '.tar', '.gz'],
}

function extGroup(ext) {
  const e = ext.toLowerCase()
  for (const [group, exts] of Object.entries(EXT_GROUPS)) {
    if (exts.includes(e)) return group
  }
  return 'Other'
}

function moveOne(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  // Never overwrite: append " (1)", " (2)" the way Windows does.
  let dest = to
  let n = 1
  while (fs.existsSync(dest)) {
    const ext = path.extname(to)
    dest = path.join(path.dirname(to), `${path.basename(to, ext)} (${n})${ext}`)
    n += 1
  }
  try {
    fs.renameSync(from, dest)
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(from, dest)
      fs.unlinkSync(from)
    } else throw err
  }
  return dest
}

ipcMain.handle('run-operations', async (_, operations) => {
  const results = []

  for (const op of operations || []) {
    const t = op.type
    const targets = ['source', 'destination', 'path'].map(k => op[k]).filter(Boolean)
    const blocked = targets.find(isProtected)

    if (blocked) {
      results.push({
        op: t, status: 'refused',
        detail: `I won't touch ${blocked} — it's a system or development folder.`,
      })
      continue
    }

    try {
      if (t === 'delete_file') {
        // Recycle Bin = recoverable. This is the quarantine.
        await shell.trashItem(op.path)
        results.push({ op: t, status: 'done', detail: `${path.basename(op.path)} moved to the Recycle Bin` })

      } else if (t === 'delete_folder_recursive') {
        await shell.trashItem(op.path)
        results.push({ op: t, status: 'done', detail: `${path.basename(op.path)} moved to the Recycle Bin` })

      } else if (t === 'permanently_delete_file') {
        // Gone for good — not in the bin either.
        fs.unlinkSync(op.path)
        results.push({ op: t, status: 'done', detail: `Permanently deleted ${path.basename(op.path)}. This cannot be undone.` })

      } else if (t === 'permanently_delete_folder') {
        fs.rmSync(op.path, { recursive: true, force: true })
        results.push({ op: t, status: 'done', detail: `Permanently deleted ${path.basename(op.path)}. This cannot be undone.` })

      } else if (t === 'move_file') {
        const dest = moveOne(op.source, op.destination)
        results.push({ op: t, status: 'done', detail: `Moved to ${path.basename(dest)}` })

      } else if (t === 'move_files') {
        let moved = 0
        for (const name of fs.readdirSync(op.source)) {
          const from = path.join(op.source, name)
          if (fs.statSync(from).isFile()) {
            moveOne(from, path.join(op.destination, name))
            moved += 1
          }
        }
        results.push({ op: t, status: 'done', detail: `Moved ${moved} file(s)` })

      } else if (t === 'copy_files') {
        let copied = 0
        fs.mkdirSync(op.destination, { recursive: true })
        for (const name of fs.readdirSync(op.source)) {
          const from = path.join(op.source, name)
          if (fs.statSync(from).isFile()) {
            fs.copyFileSync(from, path.join(op.destination, name))
            copied += 1
          }
        }
        results.push({ op: t, status: 'done', detail: `Copied ${copied} file(s)` })

      } else if (t === 'move_folder') {
        const dest = path.join(op.destination, path.basename(op.source))
        fs.mkdirSync(op.destination, { recursive: true })
        fs.renameSync(op.source, dest)
        results.push({ op: t, status: 'done', detail: `Moved ${path.basename(op.source)}` })

      } else if (t === 'create_folder') {
        fs.mkdirSync(op.path, { recursive: true })
        results.push({ op: t, status: 'done', detail: `Created ${path.basename(op.path)}` })

      } else if (t === 'rename') {
        const dest = path.join(path.dirname(op.path), op.new_name)
        fs.renameSync(op.path, dest)
        results.push({ op: t, status: 'done', detail: `Renamed to ${op.new_name}` })

      } else if (t === 'organize_by_type') {
        let moved = 0
        for (const name of fs.readdirSync(op.source)) {
          const from = path.join(op.source, name)
          if (!fs.statSync(from).isFile()) continue
          const group = extGroup(path.extname(name))
          moveOne(from, path.join(op.source, group, name))
          moved += 1
        }
        results.push({ op: t, status: 'done', detail: `Sorted ${moved} file(s) into folders by type` })

      } else {
        results.push({ op: t, status: 'failed', detail: `Unknown operation: ${t}` })
      }
    } catch (err) {
      results.push({ op: t, status: 'failed', detail: String(err.message || err) })
    }
  }

  return results
})

// ─── IPC: Google OAuth ────────────────────────────────────────────────────────

ipcMain.handle('google-auth-start', async () => {
  // Opens Google OAuth in the user's default browser
  // Backend redirects back to minimanager://auth?token=... when done
  await shell.openExternal('http://localhost:8000/api/v1/auth/google?mode=desktop')
})

// ─── IPC: Get platform info ───────────────────────────────────────────────────

ipcMain.handle('get-platform', () => process.platform)
