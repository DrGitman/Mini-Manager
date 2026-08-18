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
// A preview is the first 400 bytes of the file, and it is sent to the AI to
// improve classification. So this list decides what leaves the machine — it is
// a privacy boundary, not a convenience list.
//
// .env was here, which meant a scan of any project folder uploaded the top of
// every .env file — API keys and database passwords — to a third party. File
// types whose whole purpose is holding credentials are excluded, and
// SECRET_NAME_RE catches the ones identifiable by name instead.
const TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.log', '.yaml', '.yml',
  '.xml', '.html', '.htm', '.js', '.ts', '.jsx', '.tsx', '.py', '.css',
  '.toml', '.sql',
])

/**
 * Files we never read, whatever their extension.
 * Keys, certificates, credential stores and anything named like a secret.
 */
const SECRET_NAME_RE = /(^\.env|\.env$|\.env\.|^id_[rd]sa|\.pem$|\.key$|\.pfx$|\.p12$|\.keystore$|\.ppk$|credential|secret|password|\.htpasswd|\.netrc|\.npmrc|\.pgpass)/i

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
    // The Next server is forked moments earlier and takes a second or two to
    // listen, so loading straight away fails with connection-refused and the
    // window sits blank. Show a loading state immediately — otherwise
    // ready-to-show never fires during the retries and no window appears at
    // all, which reads as the app failing to launch.
    mainWindow.loadURL(SPLASH_URL)
    loadWhenReady(mainWindow, 'http://localhost:3333')
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

/** Shown for the second or two the internal server takes to start. */
const SPLASH_URL =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    `<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
                  font-family:Segoe UI,system-ui,sans-serif;background:#fff;color:#666">
       <div style="text-align:center">
         <div style="width:28px;height:28px;margin:0 auto 16px;border:3px solid #e5e7eb;
                     border-top-color:#3364db;border-radius:50%;animation:s .8s linear infinite"></div>
         <div style="font-size:14px">Starting Mini Manager…</div>
       </div>
       <style>@keyframes s{to{transform:rotate(360deg)}}</style>
     </body>`,
  )

/**
 * Load the app once the server answers.
 *
 * loadURL rejects if nothing is listening yet, so each failure is retried
 * rather than left as a blank window. ~30s of headroom covers a cold start on
 * a slow disk; past that something is genuinely wrong and we say so.
 */
function loadWhenReady(win, url, attempt = 0) {
  if (!win || win.isDestroyed()) return
  win.loadURL(url).catch(() => {
    if (attempt >= 60) {
      showStartupError(
        'Mini Manager could not reach its internal server.',
        'The server did not start within 30 seconds. Restarting the app usually fixes this.',
      )
      return
    }
    setTimeout(() => loadWhenReady(win, url, attempt + 1), 500)
  })
}

/**
 * Where server.js ends up depends on how the app was packaged, so try each
 * known layout rather than assuming one. Getting this wrong is invisible: the
 * fork fails, nothing listens on 3333, and the user sees a blank white window
 * with no error anywhere.
 */
function findServerPath() {
  const candidates = [
    // asar: false — what this app ships.
    path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js'),
    // If asar is ever re-enabled, it must be paired with asarUnpack for the
    // standalone folder, because fork() cannot run a script inside an archive.
    path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone', 'server.js'),
    // Running unpackaged.
    path.join(app.getAppPath(), '.next', 'standalone', 'server.js'),
  ]
  return candidates.find(p => fs.existsSync(p)) ?? null
}

function startNextServer() {
  const serverPath = findServerPath()
  if (!serverPath) {
    console.error('Standalone server not found. Looked in resources/app, app.asar.unpacked and the app path.')
    showStartupError(
      'Mini Manager could not start its internal server.',
      'The application files appear to be incomplete. Reinstalling usually fixes this.',
    )
    return
  }

  nextServerProcess = require('child_process').fork(serverPath, [], {
    // server.js resolves .next/ and public/ relative to where it runs.
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      PORT: '3333',
      NODE_ENV: 'production',
      // fork() in Electron re-launches the Electron binary, not Node. Without
      // this the "child" boots as a second copy of the app, fails the
      // single-instance lock, and quits — so the server never started and the
      // window had nothing to load.
      ELECTRON_RUN_AS_NODE: '1',
    },
    silent: true,
  })

  nextServerProcess.stderr?.on('data', d => console.error('[next]', d.toString()))
  nextServerProcess.on('error', err => {
    console.error('Next.js server error:', err)
    showStartupError('Mini Manager could not start its internal server.', String(err && err.message))
  })
  nextServerProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error('Next.js server exited with code', code)
      showStartupError(
        'Mini Manager’s internal server stopped unexpectedly.',
        `It exited with code ${code}. Restarting the app usually fixes this.`,
      )
    }
  })
}

/** Say what went wrong in the window, rather than leaving it blank. */
function showStartupError(title, detail) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  mainWindow.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        `<body style="font-family:Segoe UI,system-ui,sans-serif;padding:48px;color:#1a1a1a">
           <h2 style="margin:0 0 12px">${esc(title)}</h2>
           <p style="color:#555;line-height:1.6">${esc(detail)}</p>
           <p style="color:#888;font-size:13px;margin-top:24px">
             If it keeps happening, contact support and mention this screen.
           </p>
         </body>`,
      ),
  )
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

      if (TEXT_EXTS.has(ext) && stat.size < 500_000 && !SECRET_NAME_RE.test(entry.name)) {
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

/**
 * The real location of the user's own folders.
 *
 * These used to be guessed by sticking the first word of the account's display
 * name onto "C:\Users\". That is wrong whenever the Windows profile folder
 * differs from the display name, which is most of the time — the agent then
 * scanned a path that does not exist and reported an empty folder.
 * app.getPath knows the actual, redirected-aware locations.
 */
/**
 * Whether a typed path is a folder we can actually read.
 *
 * A path entered by hand and never checked simply produced an empty scan with
 * no explanation, so a single typo looked like the app being broken.
 */
ipcMain.handle('path-exists', async (_, dirPath) => {
  try {
    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) return { ok: false, error: 'That path is a file, not a folder.' }
    fs.readdirSync(dirPath)
    return { ok: true }
  } catch (err) {
    const code = err && err.code
    if (code === 'ENOENT') return { ok: false, error: 'That folder does not exist.' }
    if (code === 'EPERM' || code === 'EACCES') return { ok: false, error: 'No permission to read that folder.' }
    return { ok: false, error: 'That folder could not be opened.' }
  }
})

ipcMain.handle('get-user-paths', async () => {
  const safe = (name) => {
    try { return app.getPath(name) } catch { return null }
  }
  return {
    home: safe('home'),
    downloads: safe('downloads'),
    desktop: safe('desktop'),
    documents: safe('documents'),
  }
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

/**
 * Where archived files go.
 *
 * "Delete" sends things to the Recycle Bin; "archive" is different — the user
 * wants to keep the file but move it out of the way, and wants to find it
 * again in the Archive page. A visible folder in their home directory is
 * somewhere they can also reach it without the app.
 */
function archiveRoot() {
  const root = path.join(app.getPath('home'), 'Mini Manager Archive')
  fs.mkdirSync(root, { recursive: true })
  return root
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
        results.push({ op: t, status: 'done', detail: `${path.basename(op.path)} moved to the Recycle Bin`,
          file_name: path.basename(op.path), from: op.path, to: 'Recycle Bin' })

      } else if (t === 'delete_folder_recursive') {
        await shell.trashItem(op.path)
        results.push({ op: t, status: 'done', detail: `${path.basename(op.path)} moved to the Recycle Bin`,
          file_name: path.basename(op.path), from: op.path, to: 'Recycle Bin' })

      } else if (t === 'permanently_delete_file') {
        // Gone for good — not in the bin either.
        fs.unlinkSync(op.path)
        results.push({ op: t, status: 'done', detail: `Permanently deleted ${path.basename(op.path)}. This cannot be undone.` })

      } else if (t === 'permanently_delete_folder') {
        fs.rmSync(op.path, { recursive: true, force: true })
        results.push({ op: t, status: 'done', detail: `Permanently deleted ${path.basename(op.path)}. This cannot be undone.` })

      } else if (t === 'move_file') {
        const dest = moveOne(op.source, op.destination)
        results.push({ op: t, status: 'done', detail: `Moved to ${path.basename(dest)}`,
          file_name: path.basename(op.source), from: op.source, to: dest })

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
        results.push({ op: t, status: 'done', detail: `Moved ${path.basename(op.source)}`,
          file_name: path.basename(op.source), from: op.source, to: dest })

      } else if (t === 'create_folder') {
        fs.mkdirSync(op.path, { recursive: true })
        results.push({ op: t, status: 'done', detail: `Created ${path.basename(op.path)}` })

      } else if (t === 'rename') {
        const dest = path.join(path.dirname(op.path), op.new_name)
        fs.renameSync(op.path, dest)
        results.push({ op: t, status: 'done', detail: `Renamed to ${op.new_name}`,
          file_name: path.basename(op.path), from: op.path, to: dest })

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

      } else if (t === 'archive' || t === 'archive_file' || t === 'archive_folder') {
        // Keep it, but out of the way — and recorded, so the Archive page can
        // show it and restore it later.
        const src = op.path || op.source
        const dest = moveOne(src, path.join(archiveRoot(), path.basename(src)))
        results.push({
          op: 'archive', status: 'done',
          detail: `Archived ${path.basename(src)}`,
          file_name: path.basename(src), from: src, to: dest,
        })

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

ipcMain.handle('google-auth-start', async (_, opts = {}) => {
  // Opens Google OAuth in the user's default browser.
  // The backend redirects back to minimanager://auth?token=... when done.
  //
  // The base URL is passed in by the renderer: this used to be hard-coded to
  // localhost:8000, so Google sign-in could never work in the installed app.
  const base = (opts.apiBase || '').replace(/\/$/, '') || 'http://localhost:8000'
  const intent = opts.intent === 'login' ? 'login' : 'signup'
  await shell.openExternal(`${base}/api/v1/auth/google?mode=desktop&intent=${intent}`)
})

// ─── IPC: Get platform info ───────────────────────────────────────────────────

ipcMain.handle('get-platform', () => process.platform)
