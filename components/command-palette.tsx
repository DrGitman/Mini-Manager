'use client'

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react'
import { Search, X, Clock, FileText, Folder, CornerDownLeft } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResultKind = 'command' | 'file' | 'folder'

export interface SearchResult {
  id: string
  kind: ResultKind
  label: string
  sublabel?: string
  /** Per-result icon. Strongly recommended for commands. Falls back to kind icon. */
  icon?: React.ElementType
  tags?: string[]
  meta?: string
  run: () => void
}

interface SearchBarProps {
  commands: SearchResult[]
  onSearch?: (query: string) => Promise<SearchResult[]>
  recents?: string[]
  onRecentsChange?: (recents: string[]) => void
  placeholder?: string
  panelWidth?: 'input' | 'wide'
}

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

export function fuzzyScore(
  text: string,
  query: string,
): { score: number; hits: number[] } | null {
  if (!query) return { score: 0, hits: [] }

  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const hits: number[] = []

  let ti = 0
  let score = 0
  let streak = 0

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    let found = -1

    while (ti < lower.length) {
      if (lower[ti] === ch) { found = ti; break }
      ti++
    }
    if (found === -1) return null

    hits.push(found)
    streak = hits.length > 1 && hits[hits.length - 2] === found - 1 ? streak + 1 : 0
    score += 1 + streak * 2

    const prev = found > 0 ? lower[found - 1] : ' '
    if (' _-/.'.includes(prev)) score += 3
    if (found === 0) score += 5
    ti = found + 1
  }

  return { score: score - text.length * 0.01, hits }
}

function highlight(text: string, hits: number[]) {
  if (!hits.length) return [{ text, match: false }]
  const parts: { text: string; match: boolean }[] = []
  let cursor = 0

  for (let i = 0; i < hits.length; i++) {
    const start = hits[i]
    let end = start
    while (i + 1 < hits.length && hits[i + 1] === end + 1) { end++; i++ }
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false })
    parts.push({ text: text.slice(start, end + 1), match: true })
    cursor = end + 1
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false })
  return parts
}

// ─── Config ───────────────────────────────────────────────────────────────────

const KIND_ICON: Record<ResultKind, React.ElementType> = {
  command: CornerDownLeft,
  file: FileText,
  folder: Folder,
}

const GROUP_ORDER: ResultKind[] = ['command', 'folder', 'file']
const GROUP_LABEL: Record<ResultKind, string> = {
  command: 'Actions',
  folder: 'Folders',
  file: 'Files',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded border border-border bg-background px-1 font-sans text-[9px] font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SearchBar({
  commands,
  onSearch,
  recents = [],
  onRecentsChange,
  placeholder = 'Search files...',
  panelWidth = 'wide',
}: SearchBarProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchToken = useRef(0)

  // Cmd+K focuses the input in place — no modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Debounced remote search
  useEffect(() => {
    if (!onSearch || query.trim().length < 2) {
      setRemote([])
      setLoading(false)
      return
    }
    const t = ++searchToken.current
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const res = await onSearch(query)
        if (t === searchToken.current) setRemote(res)
      } catch {
        if (t === searchToken.current) setRemote([])
      } finally {
        if (t === searchToken.current) setLoading(false)
      }
    }, 160)

    return () => clearTimeout(timer)
  }, [query, onSearch])

  // Scoring + grouping
  const grouped = useMemo(() => {
    const pool = [...commands, ...remote]

    const scored = pool
      .map(r => {
        const hay = `${r.label} ${r.sublabel ?? ''} ${(r.tags ?? []).join(' ')}`
        const m = fuzzyScore(hay, query)
        if (!m) return null
        const lm = fuzzyScore(r.label, query)
        return { result: r, score: m.score + (lm?.score ?? 0), hits: lm?.hits ?? [] }
      })
      .filter(Boolean) as { result: SearchResult; score: number; hits: number[] }[]

    scored.sort((a, b) => b.score - a.score)

    const out: Record<ResultKind, typeof scored> = { command: [], folder: [], file: [] }
    for (const s of scored) out[s.result.kind].push(s)
    out.command = query ? out.command.slice(0, 4) : out.command.slice(0, 3)
    return out
  }, [commands, remote, query])

  const flat = useMemo(() => GROUP_ORDER.flatMap(k => grouped[k]), [grouped])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const commit = useCallback(
    (r: SearchResult) => {
      const q = query.trim()
      if (q && onRecentsChange) {
        onRecentsChange([q, ...recents.filter(x => x !== q)].slice(0, 4))
      }
      setOpen(false)
      setQuery('')
      inputRef.current?.blur()
      r.run()
    },
    [query, recents, onRecentsChange],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive(i => flat.length ? (i + 1) % flat.length : 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => flat.length ? (i - 1 + flat.length) % flat.length : 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[active]
      if (item) commit(item.result)
    }
  }

  const showPanel = open && (flat.length > 0 || query.length >= 2 || recents.length > 0)
  let running = -1

  return (
    <div ref={wrapRef} className="relative w-full max-w-sm">
      {/* The bar: stays in the header, never moves */}
      <div
        className={`flex h-9 items-center gap-2.5 rounded-lg border bg-card px-3 transition ${
          open
            ? 'border-primary/30 ring-4 ring-primary/5'
            : 'border-border hover:border-border/80'
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {loading ? (
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-border border-t-foreground" />
        ) : query ? (
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 items-center gap-px rounded border border-border bg-muted/40 px-1.5 py-px font-sans text-[10px] font-medium text-muted-foreground sm:flex">
            <span className="text-[12px] leading-none">⌘</span>K
          </kbd>
        )}
      </div>

      {/* Anchored dropdown — no backdrop, no dimming */}
      {showPanel && (
        <div
          className={`absolute right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl border border-border bg-card shadow-lg ${
            panelWidth === 'wide' ? 'w-[440px]' : 'w-full'
          }`}
        >
          <div
            ref={listRef}
            className="max-h-[320px] overflow-y-auto overscroll-contain py-1.5
                       [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]
                       [&::-webkit-scrollbar]:w-1.5
                       [&::-webkit-scrollbar-thumb]:rounded-full
                       [&::-webkit-scrollbar-thumb]:bg-border
                       [&::-webkit-scrollbar-track]:bg-transparent"
          >
            {/* Recents — only shown when query is empty */}
            {!query && recents.length > 0 && (
              <>
                <GroupLabel>Recent</GroupLabel>
                {recents.map(r => (
                  <button
                    key={r}
                    onClick={() => { setQuery(r); inputRef.current?.focus() }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/40"
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                    <span className="truncate text-[13px] text-muted-foreground">{r}</span>
                  </button>
                ))}
              </>
            )}

            {GROUP_ORDER.map(kind => {
              const rows = grouped[kind]
              if (!rows.length) return null
              return (
                <div key={kind}>
                  <GroupLabel>{GROUP_LABEL[kind]}</GroupLabel>
                  {rows.map(({ result, hits }) => {
                    running++
                    const idx = running
                    const isActive = idx === active
                    const Icon = result.icon ?? KIND_ICON[result.kind]

                    return (
                      <button
                        key={result.id}
                        data-index={idx}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => commit(result)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${
                          isActive ? 'bg-accent' : 'hover:bg-muted/40'
                        }`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                          isActive ? 'bg-background shadow-sm' : 'bg-muted'
                        }`}>
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[13px] text-foreground ${
                            result.kind === 'file' ? 'font-mono text-[12.5px]' : ''
                          }`}>
                            {highlight(result.label, hits).map((p, i) =>
                              p.match ? (
                                <mark key={i} className="bg-transparent font-semibold text-primary">
                                  {p.text}
                                </mark>
                              ) : (
                                <React.Fragment key={i}>{p.text}</React.Fragment>
                              ),
                            )}
                          </span>
                          {result.sublabel && (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {result.sublabel}
                            </span>
                          )}
                        </span>

                        {result.meta && (
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {result.meta}
                          </span>
                        )}
                        {isActive && <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      </button>
                    )
                  })}
                </div>
              )
            })}

            {query.length >= 2 && !loading && flat.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="text-[13px] text-muted-foreground">
                  Nothing matches <span className="font-mono text-foreground">{query}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Try a filename, a folder, or an action like "undo".
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-border bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Key>↑</Key><Key>↓</Key>navigate</span>
            <span className="flex items-center gap-1"><Key>↵</Key>open</span>
            <span className="flex items-center gap-1"><Key>esc</Key>close</span>
          </div>
        </div>
      )}
    </div>
  )
}
