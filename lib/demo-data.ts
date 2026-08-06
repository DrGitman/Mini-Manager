import type { FileMeta, AppNotification } from './types'

const DAY = 86400000

function f(
  id: string,
  name: string,
  sizeKB: number,
  daysAgo: number,
): FileMeta {
  const dot = name.lastIndexOf('.')
  return {
    id,
    name,
    extension: dot >= 0 ? name.slice(dot) : '',
    relativePath: name,
    sizeBytes: Math.round(sizeKB * 1024),
    modifiedAt: Date.now() - daysAgo * DAY,
  }
}

/** A realistic messy Downloads folder for demo mode. */
export const DEMO_LIBRARY: FileMeta[] = [
  f('d01', 'invoice_march_final (2).pdf', 245, 3),
  f('d02', 'IMG_20240612_093015.jpg', 3400, 54),
  f('d03', 'Screenshot 2025-07-14 182240.png', 890, 22),
  f('d04', 'resume_v7_FINAL_final.docx', 78, 11),
  f('d05', 'bank-statement-june.pdf', 412, 35),
  f('d06', 'untitled document.docx', 15, 2),
  f('d07', 'vacation_video.mp4', 184000, 90),
  f('d08', 'receipt-amazon-order-8823.pdf', 98, 6),
  f('d09', 'project_notes.txt', 4, 1),
  f('d10', 'DSC04512.jpg', 5200, 120),
  f('d11', 'lease_agreement_signed.pdf', 1240, 200),
  f('d12', 'setup-installer-notes.txt', 2, 45),
  f('d13', 'W2_2024.pdf', 156, 160),
  f('d14', 'boarding-pass-BER-JFK.pdf', 74, 18),
  f('d15', 'Screenshot 2025-08-01 091502.png', 1020, 4),
  f('d16', 'meeting-recording.mp3', 48000, 9),
  f('d17', 'old-backup.zip', 820000, 300),
  f('d18', 'presentation_draft_new_v3.pptx', 8400, 7),
  f('d19', 'grocery list.txt', 1, 0),
  f('d20', 'contract_freelance_2025.pdf', 340, 28),
  f('d21', 'IMG_4821.HEIC', 2900, 61),
  f('d22', 'budget-spreadsheet copy.xlsx', 44, 15),
  f('d23', 'cover_letter_acme.docx', 32, 12),
  f('d24', 'random_download.bin', 15000, 87),
  f('d25', 'family-photo-christmas.png', 4100, 220),
]

export const DEMO_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    title: 'Scan complete',
    body: '25 files scanned in Downloads. 18 can be auto-organized.',
    kind: 'scan',
    read: false,
    createdAt: Date.now() - 2 * 60000,
  },
  {
    id: 'n2',
    title: 'Batch applied',
    body: '14 files organized into 6 folders. Undo available in History.',
    kind: 'apply',
    read: false,
    createdAt: Date.now() - 40 * 60000,
  },
  {
    id: 'n3',
    title: 'Tip: Naming conventions',
    body: 'You can change how files are renamed in Settings → Preferences.',
    kind: 'tip',
    read: false,
    createdAt: Date.now() - 2 * 3600000,
  },
  {
    id: 'n4',
    title: 'Undo successful',
    body: 'Batch from Aug 2 was reverted. All 9 files are back in place.',
    kind: 'undo',
    read: true,
    createdAt: Date.now() - DAY,
  },
  {
    id: 'n5',
    title: 'Welcome to Mini Manager',
    body: 'Run your first scan from the dashboard to see AI proposals.',
    kind: 'system',
    read: true,
    createdAt: Date.now() - 3 * DAY,
  },
]
