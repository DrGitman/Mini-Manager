'use client'

import { useCallback, useRef, useState } from 'react'
import {
  FileSearch, Loader2, FolderOpen, Tag, ArrowRight,
  Sparkles, Info, RotateCcw, Upload, FileText, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { apiExplain, type ExplainResult } from '@/lib/api'

// ─── Text extraction (no external deps) ──────────────────────────────────────

const TEXT_MIME_PREFIXES = [
  'text/', 'application/json', 'application/xml',
  'application/javascript', 'application/x-yaml',
]
const TEXT_EXTENSIONS = new Set(['txt','md','csv','json','xml','yaml','yml','log','ts','js','py','rs','go','html','css'])

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const isText = TEXT_MIME_PREFIXES.some(p => file.type.startsWith(p)) || TEXT_EXTENSIONS.has(ext)
  if (!isText) return '' // PDFs, Word docs etc — AI uses filename only
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = e => resolve((e.target?.result as string ?? '').slice(0, 2000))
    reader.onerror = () => resolve('')
    reader.readAsText(file)
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ─── Example chips ────────────────────────────────────────────────────────────

const EXAMPLES = [
  { filename: 'NDA_signed_v3_FINAL.pdf',          ext: 'pdf',  size: 210000  },
  { filename: 'invoice_march_2026.pdf',            ext: 'pdf',  size: 85000   },
  { filename: 'lease_agreement_signed_2026.pdf',   ext: 'pdf',  size: 340000  },
  { filename: 'IMG_4821.heic',                     ext: 'heic', size: 3100000 },
  { filename: 'resume_v7_FINAL_final.docx',        ext: 'docx', size: 44000   },
  { filename: 'meeting-recording-2026-08.mp3',     ext: 'mp3',  size: 14000000},
]

// ─── Confidence bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 55 ? 'bg-amber-400' : 'bg-muted-foreground/40'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  )
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ result, filename }: { result: ExplainResult; filename: string }) {
  return (
    <Card className="bg-card border border-border rounded-lg shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">AI Analysis</CardTitle>
            <CardDescription className="text-xs text-muted-foreground truncate max-w-xs">{filename}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <p className="text-sm text-foreground leading-relaxed">{result.summary}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Category</p>
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-primary shrink-0" />
              <Badge variant="secondary" className="text-xs font-medium">{result.suggested_category}</Badge>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Rename to</p>
            <div className="flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-mono text-foreground truncate" title={result.suggested_name}>{result.suggested_name}</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Move to</p>
            <div className="flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-mono text-foreground truncate" title={result.suggested_folder}>{result.suggested_folder}</span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Confidence</p>
          <ConfidenceBar value={result.confidence} />
        </div>

        {result.tokens_used > 0 && (
          <p className="text-xs text-muted-foreground/60">{result.tokens_used} tokens used</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({
  onFile,
  loading,
}: {
  onFile: (file: File) => void
  loading: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`w-full rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none ${
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-accent/40'
      } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <Upload className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
      <p className="text-sm font-medium text-foreground">Drop a file here or click to browse</p>
      <p className="mt-1 text-xs text-muted-foreground">
        PDF, Word, text files, images, audio, any file type
      </p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExplainPage() {
  // Shared result + error
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ExplainResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultFilename, setResultFilename] = useState('')

  // Manual tab state
  const [filename, setFilename] = useState('')
  const [extension, setExtension] = useState('')
  const [sizeKb, setSizeKb] = useState('')
  const [preview, setPreview] = useState('')

  // Upload tab state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)

  function reset() {
    setResult(null)
    setError(null)
    setResultFilename('')
    setFilename('')
    setExtension('')
    setSizeKb('')
    setPreview('')
    setUploadedFile(null)
  }

  function handleFilenameChange(val: string) {
    setFilename(val)
    const parts = val.split('.')
    if (parts.length > 1) setExtension(parts[parts.length - 1].toLowerCase())
  }

  function loadExample(ex: typeof EXAMPLES[0]) {
    setFilename(ex.filename)
    setExtension(ex.ext)
    setSizeKb(String(Math.round(ex.size / 1024)))
    setPreview('')
    setResult(null)
    setError(null)
  }

  async function runExplain(name: string, ext: string, size: number, contentPreview?: string) {
    setLoading(true)
    setResult(null)
    setError(null)
    setResultFilename(name)
    try {
      const res = await apiExplain(name, ext, size, contentPreview)
      setResult(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Explanation failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleManualExplain() {
    if (!filename.trim()) return
    await runExplain(
      filename.trim(),
      extension.trim() || filename.split('.').pop() || '',
      sizeKb ? parseInt(sizeKb) * 1024 : 0,
      preview.trim() || undefined,
    )
  }

  async function handleFileUpload(file: File) {
    setUploadedFile(file)
    setResult(null)
    setError(null)
    setExtracting(true)
    let text = ''
    try {
      text = await extractTextFromFile(file)
    } catch {
      // if extraction fails, proceed with name only
    } finally {
      setExtracting(false)
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    await runExplain(file.name, ext, file.size, text || undefined)
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Explain File</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a document or paste a filename. AI will tell you what it contains, how to rename it, and where to file it.
        </p>
      </div>

      <Tabs defaultValue="upload">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="upload">
            <Upload className="size-3.5 mr-1.5" />
            Upload document
          </TabsTrigger>
          <TabsTrigger value="manual">
            <FileText className="size-3.5 mr-1.5" />
            Enter filename
          </TabsTrigger>
        </TabsList>

        {/* ── Upload tab ── */}
        <TabsContent value="upload" className="mt-4 flex flex-col gap-4">
          <Card className="bg-card border border-border rounded-lg shadow-sm">
            <CardContent className="pt-5 pb-5 flex flex-col gap-4">
              {uploadedFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{uploadedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(uploadedFile.size)}</p>
                  </div>
                  <button
                    onClick={reset}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <DropZone onFile={handleFileUpload} loading={loading || extracting} />
              )}

              {extracting && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Reading document…
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>

          <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
            <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <span>
              Supported: PDF, Word (name-based), text, CSV, JSON, images, and more. For PDFs, the first 3 pages are read automatically. Nothing is stored and files are discarded after analysis.
            </span>
          </div>
        </TabsContent>

        {/* ── Manual tab ── */}
        <TabsContent value="manual" className="mt-4 flex flex-col gap-4">
          {/* Quick examples */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(ex => (
              <button
                key={ex.filename}
                onClick={() => loadExample(ex)}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground hover:bg-accent"
              >
                {ex.filename}
              </button>
            ))}
          </div>

          <Card className="bg-card border border-border rounded-lg shadow-sm">
            <CardContent className="pt-5 pb-5 flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="filename" className="text-sm font-medium">Filename</Label>
                <Input
                  id="filename"
                  placeholder="e.g. NDA_signed_v3_FINAL.pdf"
                  value={filename}
                  onChange={e => handleFilenameChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !loading && handleManualExplain()}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="extension" className="text-sm font-medium">Extension</Label>
                  <Input
                    id="extension"
                    placeholder="pdf, docx, mp4…"
                    value={extension}
                    onChange={e => setExtension(e.target.value.toLowerCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sizeKb" className="text-sm font-medium">
                    Size (KB) <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="sizeKb"
                    type="number"
                    placeholder="e.g. 245"
                    value={sizeKb}
                    onChange={e => setSizeKb(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="preview" className="text-sm font-medium">
                  Content snippet <span className="text-muted-foreground font-normal">(optional, improves accuracy)</span>
                </Label>
                <Textarea
                  id="preview"
                  rows={3}
                  placeholder="Paste a few lines from the file for better accuracy on contracts, reports, etc."
                  value={preview}
                  onChange={e => setPreview(e.target.value)}
                  className="resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={handleManualExplain} disabled={loading || !filename.trim()} className="gap-2">
                  {loading
                    ? <><Loader2 className="size-4 animate-spin" />Analysing…</>
                    : <><FileSearch className="size-4" />Explain</>}
                </Button>
                {(result || filename) && (
                  <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-muted-foreground">
                    <RotateCcw className="size-3.5" />
                    Reset
                  </Button>
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Loading state */}
      {loading && (
        <Card className="bg-card border border-border rounded-lg shadow-sm">
          <CardContent className="flex items-center gap-3 pt-5 pb-5">
            <Loader2 className="size-5 animate-spin text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Analysing file…</p>
              <p className="text-xs text-muted-foreground">AI is reading the content and building a summary</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && !loading && <ResultCard result={result} filename={resultFilename} />}
    </div>
  )
}
