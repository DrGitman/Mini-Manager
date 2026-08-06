import type { FileMeta, Proposal, OrganizeRule, UserPreferences } from './types'
import { bucketFor } from './types'

const CATEGORY_BY_EXTENSION: Record<string, { folder: string; category: string }> = {
  '.jpg': { folder: 'Images', category: 'Image' },
  '.jpeg': { folder: 'Images', category: 'Image' },
  '.png': { folder: 'Images', category: 'Image' },
  '.gif': { folder: 'Images', category: 'Image' },
  '.webp': { folder: 'Images', category: 'Image' },
  '.svg': { folder: 'Images', category: 'Image' },
  '.heic': { folder: 'Images', category: 'Image' },
  '.mp4': { folder: 'Videos', category: 'Video' },
  '.mov': { folder: 'Videos', category: 'Video' },
  '.mkv': { folder: 'Videos', category: 'Video' },
  '.avi': { folder: 'Videos', category: 'Video' },
  '.mp3': { folder: 'Audio', category: 'Audio' },
  '.wav': { folder: 'Audio', category: 'Audio' },
  '.flac': { folder: 'Audio', category: 'Audio' },
  '.zip': { folder: 'Archives', category: 'Archive' },
  '.rar': { folder: 'Archives', category: 'Archive' },
  '.7z': { folder: 'Archives', category: 'Archive' },
  '.tar': { folder: 'Archives', category: 'Archive' },
  '.gz': { folder: 'Archives', category: 'Archive' },
}

const KEYWORD_HINTS: Array<{ pattern: RegExp; folder: string; category: string; boost: number }> = [
  { pattern: /invoice|receipt|billing|payment/i, folder: 'Documents/Finance', category: 'Finance', boost: 0.92 },
  { pattern: /resume|cv\b|cover[ _-]?letter/i, folder: 'Documents/Career', category: 'Career', boost: 0.9 },
  { pattern: /screenshot|screen[ _-]?shot|capture/i, folder: 'Images/Screenshots', category: 'Screenshot', boost: 0.95 },
  { pattern: /tax|w2|1099|irs/i, folder: 'Documents/Finance/Taxes', category: 'Taxes', boost: 0.9 },
  { pattern: /contract|agreement|nda|lease/i, folder: 'Documents/Legal', category: 'Legal', boost: 0.88 },
  { pattern: /ticket|boarding|itinerary|booking/i, folder: 'Documents/Travel', category: 'Travel', boost: 0.85 },
]

function formatDate(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function cleanSubject(name: string, extension: string): string {
  let base = name.slice(0, name.length - extension.length)
  base = base
    .replace(/[_\s]+/g, '-')
    .replace(/\(\d+\)/g, '')
    .replace(/\b(copy|final|final2|new|untitled|document|img|dsc|scan)\b/gi, '')
    .replace(/\d{8,}/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!base) base = 'file'
  return base
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')
}

export function applyNamingConvention(
  file: FileMeta,
  subject: string,
  convention: UserPreferences['namingConvention'],
): string {
  const date = formatDate(file.modifiedAt)
  switch (convention) {
    case 'date-subject':
      return `${date}_${subject}${file.extension}`
    case 'subject-date':
      return `${subject}_${date}${file.extension}`
    case 'keep-clean':
      return `${subject}${file.extension}`
  }
}

function matchesRule(file: FileMeta, rule: OrganizeRule): boolean {
  const m = rule.match
  if (m.extensions?.length && !m.extensions.map((e) => e.toLowerCase()).includes(file.extension.toLowerCase())) return false
  if (m.nameContains?.length && !m.nameContains.some((k) => file.name.toLowerCase().includes(k.toLowerCase()))) return false
  if (m.olderThanDays && Date.now() - file.modifiedAt < m.olderThanDays * 86400000) return false
  if (m.largerThanMB && file.sizeBytes < m.largerThanMB * 1024 * 1024) return false
  return true
}

/**
 * Local heuristic pass. Returns proposals for files it can confidently classify,
 * and the list of "ambiguous" files that should go to the AI.
 */
export function runHeuristics(
  files: FileMeta[],
  rules: OrganizeRule[],
  prefs: UserPreferences,
): { proposals: Proposal[]; ambiguous: FileMeta[] } {
  const proposals: Proposal[] = []
  const ambiguous: FileMeta[] = []

  for (const file of files) {
    // 1. User rules take priority
    const rule = rules.find((r) => r.enabled && matchesRule(file, r))
    if (rule) {
      const subject = cleanSubject(file.name, file.extension)
      proposals.push({
        id: `p-${file.id}`,
        file,
        targetFolder: rule.action.targetFolder,
        newName: applyNamingConvention(file, subject, prefs.namingConvention),
        category: 'Rule match',
        reason: `Matches your rule: "${rule.naturalText}"`,
        confidence: 0.97,
        bucket: bucketFor(0.97, prefs),
        selected: true,
        source: 'rule',
      })
      continue
    }

    // 2. Keyword hints (high confidence)
    const hint = KEYWORD_HINTS.find((h) => h.pattern.test(file.name))
    if (hint) {
      const subject = cleanSubject(file.name, file.extension)
      proposals.push({
        id: `p-${file.id}`,
        file,
        targetFolder: hint.folder,
        newName: applyNamingConvention(file, subject, prefs.namingConvention),
        category: hint.category,
        reason: `File name suggests ${hint.category.toLowerCase()} content`,
        confidence: hint.boost,
        bucket: bucketFor(hint.boost, prefs),
        selected: bucketFor(hint.boost, prefs) === 'auto',
        source: 'heuristic',
      })
      continue
    }

    // 3. Media/archive extensions are unambiguous
    const cat = CATEGORY_BY_EXTENSION[file.extension.toLowerCase()]
    if (cat) {
      const subject = cleanSubject(file.name, file.extension)
      proposals.push({
        id: `p-${file.id}`,
        file,
        targetFolder: cat.folder,
        newName: applyNamingConvention(file, subject, prefs.namingConvention),
        category: cat.category,
        reason: `${file.extension} files are ${cat.category.toLowerCase()}s`,
        confidence: 0.93,
        bucket: bucketFor(0.93, prefs),
        selected: true,
        source: 'heuristic',
      })
      continue
    }

    // 4. Documents and unknowns → AI
    ambiguous.push(file)
  }

  return { proposals, ambiguous }
}
