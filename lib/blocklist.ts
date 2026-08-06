/**
 * Safety layer: files and folders Mini Manager will never touch.
 * Checked at scan time AND again at apply time.
 */

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.sys', '.msi', '.bat', '.cmd', '.ps1', '.vbs',
  '.ini', '.dat', '.db', '.sqlite', '.lock', '.tmp', '.lnk', '.app', '.dmg',
])

const BLOCKED_FOLDER_NAMES = new Set([
  'windows', 'program files', 'program files (x86)', 'programdata',
  'appdata', 'system32', 'node_modules', '.git', '.svn', '$recycle.bin',
  'system volume information', 'library', 'applications',
])

const WINDOWS_RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
])

const ILLEGAL_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/

export function isBlockedExtension(ext: string): boolean {
  return BLOCKED_EXTENSIONS.has(ext.toLowerCase())
}

export function isBlockedFolder(folderName: string): boolean {
  return BLOCKED_FOLDER_NAMES.has(folderName.toLowerCase()) || folderName.startsWith('.')
}

/** Validates a proposed file name (without path). Returns an error string or null. */
export function validateProposedName(name: string, originalExtension: string): string | null {
  if (!name || name.trim().length === 0) return 'Empty name'
  if (name.length > 200) return 'Name too long'
  if (ILLEGAL_NAME_CHARS.test(name)) return 'Illegal characters in name'
  if (name.includes('..')) return 'Path traversal attempt'
  const base = name.replace(/\.[^.]*$/, '').toLowerCase()
  if (WINDOWS_RESERVED_NAMES.has(base)) return 'Reserved system name'
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''
  if (ext !== originalExtension.toLowerCase()) return 'Extension must not change'
  return null
}

/** Validates a proposed target folder (relative, forward-slash). */
export function validateTargetFolder(folder: string): string | null {
  if (!folder || folder.trim().length === 0) return 'Empty folder'
  if (folder.includes('..')) return 'Path traversal attempt'
  if (folder.startsWith('/') || /^[a-zA-Z]:/.test(folder)) return 'Absolute paths not allowed'
  if (folder.split('/').length > 4) return 'Folder nesting too deep'
  for (const segment of folder.split('/')) {
    if (ILLEGAL_NAME_CHARS.test(segment)) return 'Illegal characters in folder'
    if (WINDOWS_RESERVED_NAMES.has(segment.toLowerCase())) return 'Reserved system name'
  }
  return null
}

export const BLOCKLIST_SUMMARY = {
  extensions: Array.from(BLOCKED_EXTENSIONS),
  folders: Array.from(BLOCKED_FOLDER_NAMES),
}
