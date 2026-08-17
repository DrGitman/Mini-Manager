'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { apiGetPreferences, apiSavePreferences, type Preferences } from '@/lib/api'
import {
  Layers,
  Sparkles,
  RotateCcw,
  Shield,
  FolderDown,
  FolderPlus,
  X,
  Monitor,
  FileText,
  Check,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────────

type FolderKey = 'downloads' | 'desktop' | 'documents'
type NamingConvention = 'date-first' | 'subject-first' | 'keep-clean'

// ─── Progress Dots ─────────────────────────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex flex-col items-center gap-3 pb-6 pt-2">
      <div className="flex items-center gap-2">
        {Array.from({ length: total }, (_, i) => {
          const step = i + 1
          const isActive = step === current
          const isDone = step < current
          return (
            <div
              key={step}
              className={cn(
                'h-2.5 w-2.5 rounded-full transition-all duration-200',
                isActive
                  ? 'scale-110 bg-indigo-600 shadow-[0_0_0_3px_rgba(99,102,241,0.18)]'
                  : isDone
                  ? 'bg-indigo-400'
                  : 'border-2 border-border bg-transparent',
              )}
            />
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground font-medium">
        Step {current} of {total}
      </p>
    </div>
  )
}

// ─── Step 1: Welcome ──────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  const features = [
    {
      icon: <Sparkles className="size-4 text-indigo-600" />,
      title: 'AI Classification',
      desc: 'Files sorted and named by content, not just extension',
    },
    {
      icon: <RotateCcw className="size-4 text-indigo-600" />,
      title: 'Full Undo',
      desc: 'Every batch is reversible with a single click',
    },
    {
      icon: <Shield className="size-4 text-indigo-600" />,
      title: 'Never Deletes',
      desc: 'Files go to Archive, never the trash',
    },
  ]

  return (
    <div className="flex flex-col items-center gap-6 px-2 py-4 text-center">
      {/* Logo */}
      <Image src="/logo-dark_blue-full.png" alt="Mini Manager" width={457} height={283} className="h-10 w-auto object-contain" />

      {/* Heading */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome to Mini Manager
        </h1>
        <p className="text-base text-muted-foreground max-w-md mx-auto">
          Your AI-powered file assistant. Let&apos;s get you set up in 2 minutes.
        </p>
      </div>

      {/* Feature grid */}
      <div className="mt-2 grid w-full grid-cols-3 gap-3">
        {features.map(({ icon, title, desc }) => (
          <div
            key={title}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/40 p-4 text-center"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100">
              {icon}
            </div>
            <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
            <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Button onClick={onNext} className="mt-2 h-11 px-8 text-sm font-medium gap-2">
        Get started
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}

// ─── Step 2: Choose Folders ───────────────────────────────────────────────────

interface FolderConfig {
  key: FolderKey
  label: string
  description: string
  icon: React.ReactNode
}

const FOLDERS: FolderConfig[] = [
  {
    key: 'downloads',
    label: 'Downloads',
    description: 'The classic messy folder',
    icon: <FolderDown className="size-5 text-indigo-600" />,
  },
  {
    key: 'desktop',
    label: 'Desktop',
    description: 'Files piling up on your desktop',
    icon: <Monitor className="size-5 text-indigo-600" />,
  },
  {
    key: 'documents',
    label: 'Documents',
    description: 'Your main documents library',
    icon: <FileText className="size-5 text-indigo-600" />,
  },
]

/**
 * Pick the folders Mini Manager will look at.
 *
 * This step used to offer Downloads / Desktop / Documents as fixed choices and
 * then save no path at all, so people finished onboarding with an empty scan
 * scope and a Quick Scan that pointed at folders which did not exist. The user
 * now chooses real folders, and those exact paths are what gets saved.
 */
function StepFolders({
  folders,
  onAdd,
  onRemove,
  onNext,
  onBack,
}: {
  folders: string[]
  onAdd: () => void
  onRemove: (path: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const canBrowse = typeof window !== 'undefined' && Boolean(window.electronAPI?.openDirectoryPicker)

  return (
    <div className="flex flex-col gap-6 px-2 py-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Where should Mini Manager look?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a folder to start with — your Downloads folder is a good first pick.
          Mini Manager only ever looks at folders you choose.
        </p>
      </div>

      {folders.length > 0 && (
        <div className="flex flex-col gap-2">
          {folders.map(path => (
            <div
              key={path}
              className="flex items-center gap-3 rounded-xl border border-indigo-300 bg-indigo-50 p-4 dark:bg-indigo-950/30 dark:border-indigo-800/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                <FolderDown className="size-5 text-indigo-600" />
              </div>
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground truncate">
                  {path.split(/[\/]/).filter(Boolean).pop() ?? path}
                </span>
                <span className="text-xs text-muted-foreground font-mono truncate">{path}</span>
              </div>
              <button
                onClick={() => onRemove(path)}
                aria-label={`Remove ${path}`}
                className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onAdd}
        disabled={!canBrowse}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm font-medium transition-colors',
          canBrowse
            ? 'border-border text-foreground hover:border-indigo-300 hover:bg-indigo-50/40'
            : 'border-border text-muted-foreground cursor-not-allowed',
        )}
      >
        <FolderPlus className="size-4" />
        {folders.length ? 'Add another folder' : 'Choose a folder'}
      </button>

      {!canBrowse && (
        <p className="text-xs text-muted-foreground">
          Folder picking needs the desktop app. You can skip this and add folders
          later in Settings → Scan Scope.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        You can add, edit or remove folders anytime in{' '}
        <span className="font-medium text-foreground">Settings → Scan Scope</span>
      </p>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 text-muted-foreground">
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button onClick={onNext} className="h-10 px-6 gap-2">
          {folders.length ? 'Continue' : 'Skip for now'}
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 3: Naming Convention ────────────────────────────────────────────────

interface NamingOption {
  value: NamingConvention
  label: string
  preview: string
  hint: string
}

const NAMING_OPTIONS: NamingOption[] = [
  {
    value: 'date-first',
    label: 'Date-first',
    preview: '2026-08-05_Invoice-ACME.pdf',
    hint: 'Best for sorting by date',
  },
  {
    value: 'subject-first',
    label: 'Subject-first',
    preview: 'Invoice-ACME_2026-08-05.pdf',
    hint: 'Best for grouping by topic',
  },
  {
    value: 'keep-clean',
    label: 'Keep clean',
    preview: 'Invoice-ACME.pdf',
    hint: 'Remove noise, keep names simple',
  },
]

function StepNaming({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: NamingConvention
  onChange: (v: NamingConvention) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="flex flex-col gap-6 px-2 py-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Pick a naming style</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mini Manager will rename files consistently. You can change this later.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {NAMING_OPTIONS.map((opt) => {
          const isSelected = value === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all duration-150',
                isSelected
                  ? 'border-indigo-300 bg-indigo-50 shadow-sm ring-1 ring-indigo-200'
                  : 'border-border bg-card hover:border-indigo-200 hover:bg-indigo-50/30',
              )}
            >
              {/* Radio visual */}
              <div
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  isSelected ? 'border-indigo-600' : 'border-border',
                )}
              >
                {isSelected && (
                  <div className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                )}
              </div>

              {/* Content */}
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.hint}</span>
                </div>
                {/* File preview pill */}
                <div className="inline-flex items-center self-start rounded-md border border-border bg-background px-2.5 py-1">
                  <span className="font-mono text-xs text-foreground">{opt.preview}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 text-muted-foreground">
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button onClick={onNext} className="h-10 px-6 gap-2">
          Continue
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 4: Safety Settings ──────────────────────────────────────────────────

const SAFETY_POINTS = [
  'Every change is previewed first. You approve before anything moves.',
  'Nothing is ever deleted. Files go to Archive, not the trash.',
  'One-click undo: every batch can be reversed instantly.',
]

function StepSafety({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-6 px-2 py-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          We never break your files
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mini Manager is built around non-destructive operations.
        </p>
      </div>

      {/* Safety points */}
      <div className="flex flex-col gap-3">
        {SAFETY_POINTS.map((point) => (
          <div
            key={point}
            className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500">
              <Check className="size-3.5 text-white" strokeWidth={3} />
            </div>
            <p className="text-sm text-foreground leading-relaxed">{point}</p>
          </div>
        ))}
      </div>

      {/* Confidence threshold cosmetic */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Confidence threshold</span>
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
            85%
          </span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Auto-apply at 85% confidence or above. Everything else is flagged for your review.
        </p>
        {/* Visual slider track */}
        <div className="relative h-2 w-full rounded-full bg-muted">
          <div className="absolute left-0 top-0 h-2 w-[85%] rounded-full bg-indigo-500" />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white bg-indigo-600 shadow-sm ring-1 ring-indigo-300"
            style={{ left: 'calc(85% - 8px)' }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 text-muted-foreground">
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button onClick={onNext} className="h-10 px-6 gap-2">
          Sounds good
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 5: All Set ──────────────────────────────────────────────────────────

const FOLDER_LABELS: Record<FolderKey, string> = {
  downloads: 'Downloads',
  desktop: 'Desktop',
  documents: 'Documents',
}

const NAMING_LABELS: Record<NamingConvention, string> = {
  'date-first': 'Date-first naming',
  'subject-first': 'Subject-first naming',
  'keep-clean': 'Clean naming',
}

function StepAllSet({
  selectedFolders,
  namingConvention,
  onFinish,
}: {
  selectedFolders: Set<FolderKey>
  namingConvention: NamingConvention
  onFinish: () => void
}) {
  const folderSummary = Array.from(selectedFolders)
    .map((k) => FOLDER_LABELS[k])
    .join(' and ')

  const summary =
    folderSummary
      ? `Watching ${folderSummary} · ${NAMING_LABELS[namingConvention]}`
      : `${NAMING_LABELS[namingConvention]}`

  return (
    <div className="flex flex-col items-center gap-6 px-2 py-4 text-center">
      {/* Success icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 border-2 border-green-200">
        <Check className="size-8 text-green-600" strokeWidth={2.5} />
      </div>

      {/* Heading */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Ready to organize</h2>
        <p className="text-base text-muted-foreground max-w-sm mx-auto">
          Mini Manager will scan your folders and propose changes. You stay in control.
        </p>
      </div>

      {/* Summary pill */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <Layers className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm text-foreground font-medium">{summary}</span>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-3 pt-2 w-full max-w-xs">
        <Button onClick={onFinish} className="h-11 w-full text-sm font-medium gap-2">
          Start organizing
          <ChevronRight className="size-4" />
        </Button>
        <button
          onClick={onFinish}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
        >
          I&apos;ll explore on my own
        </button>
      </div>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [scopeFolders, setScopeFolders] = useState<string[]>([])
  const [selectedFolders, setSelectedFolders] = useState<Set<FolderKey>>(
    new Set(['downloads', 'desktop']),
  )
  const [namingConvention, setNamingConvention] = useState<NamingConvention>('date-first')

  function next() {
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }
  function back() {
    setCurrentStep((s) => Math.max(s - 1, 1))
  }

  /** Real folder paths chosen with the native picker — saved to the scan scope. */
  async function addScopeFolder() {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.openDirectoryPicker) return
    const picked = await api.openDirectoryPicker()
    if (!picked) return
    setScopeFolders(prev =>
      prev.some(p => p.toLowerCase() === picked.toLowerCase()) ? prev : [...prev, picked])
  }

  function removeScopeFolder(path: string) {
    setScopeFolders(prev => prev.filter(p => p !== path))
  }

  function toggleFolder(key: FolderKey) {
    setSelectedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function finish() {
    // Map onboarding values to backend preference schema
    const namingMap: Record<NamingConvention, string> = {
      'date-first': 'title',
      'subject-first': 'title',
      'keep-clean': 'original',
    }
    const folderCategoryMap: Record<FolderKey, string[]> = {
      downloads: ['Images', 'Videos', 'Archives', 'Code'],
      desktop:   ['Documents', 'Finance'],
      documents: ['Documents', 'Finance', 'Data'],
    }
    const categories = Array.from(
      new Set(Array.from(selectedFolders).flatMap(k => folderCategoryMap[k]))
    )
    const targetFolder = selectedFolders.has('desktop') ? 'Desktop'
      : selectedFolders.has('documents') ? 'Documents'
      : 'Downloads'

    // Save to backend (non-blocking — don't block navigation on failure).
    //
    // Merged onto the stored preferences rather than sent alone: the endpoint
    // fills anything missing with defaults, so a partial save silently reset
    // every setting the user had not reached yet.
    apiGetPreferences()
      .catch(() => null)
      .then(current => apiSavePreferences({
        ...(current ?? {}),
        naming_style: namingMap[namingConvention] ?? 'title',
        categories: categories.length ? categories : ['Documents', 'Images', 'Videos', 'Audio', 'Code', 'Archives'],
        target_folder: targetFolder,
        quarantine_mode: 'auto',
        // The folders the user actually picked. Without this the scan scope is
        // empty after onboarding and Quick Scan has nothing to show.
        custom_folders: scopeFolders,
      } as Preferences))
      .catch(() => {/* silent */})

    router.push('/organize')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          {/* Progress bar area */}
          <div className="border-b border-border px-8 pt-6">
            <ProgressDots current={currentStep} total={TOTAL_STEPS} />
          </div>

          {/* Step content */}
          <div className="px-8 py-8">
            {currentStep === 1 && <StepWelcome onNext={next} />}
            {currentStep === 2 && (
              <StepFolders
                folders={scopeFolders}
                onAdd={addScopeFolder}
                onRemove={removeScopeFolder}
                onNext={next}
                onBack={back}
              />
            )}
            {currentStep === 3 && (
              <StepNaming
                value={namingConvention}
                onChange={setNamingConvention}
                onNext={next}
                onBack={back}
              />
            )}
            {currentStep === 4 && <StepSafety onNext={next} onBack={back} />}
            {currentStep === 5 && (
              <StepAllSet
                selectedFolders={selectedFolders}
                namingConvention={namingConvention}
                onFinish={finish}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Mini Manager &mdash; your files, always under control
        </p>
      </div>
    </div>
  )
}
