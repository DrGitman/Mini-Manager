'use client'

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, CheckCircle2, Loader2, HelpCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiAgent } from '@/lib/api'
import type { AgentStep } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps?: AgentStep[]
  questions?: string[]
  needs_clarification?: boolean
  stepsExpanded?: boolean
}

// ─── Step tracker (like the screenshots) ─────────────────────────────────────

function StepTracker({ steps, expanded, onToggle }: {
  steps: AgentStep[]
  expanded: boolean
  onToggle: () => void
}) {
  const doneCount = steps.filter(s => s.status === 'done').length
  const total = steps.length

  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <span className="size-4 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-[9px] font-bold text-primary">✦</span>
        </span>
        {expanded ? 'Done' : `Done · ${total} steps`}
        <span className="ml-auto">{expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">
                {step.status === 'done' ? (
                  <CheckCircle2 className="size-3.5 text-gray-400" />
                ) : step.status === 'running' ? (
                  <Loader2 className="size-3.5 text-primary animate-spin" />
                ) : (
                  <div className="size-3.5 rounded-full border border-gray-300" />
                )}
              </div>
              <div>
                <p className={cn('text-xs font-medium', step.status === 'done' ? 'text-gray-400' : 'text-gray-700')}>
                  {step.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Thinking indicator ────────────────────────────────────────────────────────

function ThinkingIndicator() {
  const [dotCount, setDotCount] = useState(1)
  useEffect(() => {
    const t = setInterval(() => setDotCount(d => (d % 3) + 1), 500)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex items-start gap-3">
      <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="size-4 text-primary" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3">
        <div className="flex items-center gap-1.5 h-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={cn(
                'size-1.5 rounded-full bg-gray-400 transition-opacity duration-300',
                i < dotCount ? 'opacity-100' : 'opacity-30'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, onToggleSteps, onQuestionClick }: {
  msg: Message
  onToggleSteps: (id: string) => void
  onQuestionClick: (q: string) => void
}) {
  const isUser = msg.role === 'user'
  return (
    <div className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}>
      {!isUser && (
        <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="size-4 text-primary" />
        </div>
      )}
      <div className={cn('max-w-[80%] flex flex-col gap-1.5', isUser && 'items-end')}>
        <div className={cn(
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-white rounded-tr-sm'
            : 'bg-gray-100 text-gray-800 rounded-tl-sm'
        )}>
          {msg.content}
        </div>

        {/* Step tracker */}
        {msg.steps && msg.steps.length > 0 && (
          <StepTracker
            steps={msg.steps}
            expanded={!!msg.stepsExpanded}
            onToggle={() => onToggleSteps(msg.id)}
          />
        )}

        {/* Clarifying questions */}
        {msg.needs_clarification && msg.questions && msg.questions.length > 0 && (
          <div className="mt-1 flex flex-col gap-1.5">
            {msg.questions.map((q, i) => (
              <button
                key={i}
                onClick={() => onQuestionClick(q)}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
              >
                <HelpCircle className="size-3 text-gray-400 shrink-0" />
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Organise my Downloads folder by type',
  'Rename all screenshots with today\'s date',
  'Find and group duplicate files',
  'Sort files alphabetically by name',
]

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  function toggleSteps(id: string) {
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, stepsExpanded: !m.stepsExpanded } : m
    ))
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || thinking) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: trimmed }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setThinking(true)

    try {
      const apiHistory = history.map(m => ({ role: m.role, content: m.content }))
      const res = await apiAgent(apiHistory)

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.reply,
        steps: res.steps ?? [],
        questions: res.questions ?? [],
        needs_clarification: res.needs_clarification ?? false,
        stepsExpanded: false,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
      }])
    } finally {
      setThinking(false)
      inputRef.current?.focus()
    }
  }

  function onQuestionClick(q: string) {
    setInput(q)
    inputRef.current?.focus()
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">

      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bot className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-gray-900">Agent</h1>
          <p className="text-xs text-gray-400">Ask me to organise, rename, or sort your files</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-4">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Bot className="size-7 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">How can I help you today?</p>
              <p className="text-sm text-gray-400 mt-1">I can organise, rename, sort, and manage your files.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onToggleSteps={toggleSteps}
            onQuestionClick={onQuestionClick}
          />
        ))}

        {thinking && <ThinkingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-100 pt-3">
        <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder="Ask Mini Manager anything…"
            className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 outline-none bg-transparent"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || thinking}
            className="size-8 rounded-xl bg-primary flex items-center justify-center text-white disabled:opacity-40 transition-opacity hover:bg-primary/90"
          >
            {thinking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-300 mt-2">Powered by Groq · llama-3.3-70b</p>
      </div>
    </div>
  )
}
