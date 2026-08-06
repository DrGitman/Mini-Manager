'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Sparkles, X, SendHorizonal, Mic, MicOff } from 'lucide-react'
import { BouncingDots } from '@/components/ui/bouncing-dots'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/types'

// Extend window type for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  text: string
  ts: number
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'ai',
  text: "Hi! I can help you understand AI decisions, rerun batches with different rules, or answer questions about your files. You can also use the mic to speak your question.",
  ts: Date.now(),
}

const DEMO_RESPONSES: { pattern: RegExp; response: string }[] = [
  {
    pattern: /mov(e|ed)|batch|last|recent/i,
    response: "I moved 34 files in your last batch. 6 needed manual review — 3 PDFs with low-confidence naming and 3 images without date metadata.",
  },
  {
    pattern: /pdf/i,
    response: "I found 7 PDFs in your folder. 4 look like invoices or receipts and I've suggested moving them to Documents/Finance. 3 others had ambiguous names and need your review.",
  },
  {
    pattern: /image|photo|jpg|png|heic/i,
    response: "There are 5 image files in your scan. I grouped photos with timestamps into Photos/2024 and Photos/2025. 2 images had no date metadata so they're in the Review tab.",
  },
  {
    pattern: /rule|rules/i,
    response: "You have no custom rules set up yet. Go to the Organize page and open the Rules tab to add naming or sorting rules.",
  },
  {
    pattern: /confidence|score/i,
    response: "Confidence scores reflect how certain I am about a proposal. 0.85+ means auto-apply is safe. 0.70–0.85 goes to Review. Below 0.70 needs your input.",
  },
  {
    pattern: /undo|revert/i,
    response: "Every batch is journaled. Go to Safety to undo any past batch — it will restore all files to their original locations.",
  },
  {
    pattern: /organis|organiz|sort|clean/i,
    response: "To organise your files, head to the Organize page and click Scan Folder. I'll analyse your files and suggest where everything should go.",
  },
]

function getDemoResponse(input: string): string {
  for (const { pattern, response } of DEMO_RESPONSES) {
    if (pattern.test(input)) return response
  }
  return "That's a great question! In a full version I'd analyse your folder contents and give you a detailed answer. Try asking about your last batch, PDFs, images, or confidence scores."
}

export function AiPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    setVoiceSupported(!!SR)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  function startListening() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognitionRef.current = recognition

    recognition.onstart = () => setListening(true)

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('')
      setInput(transcript)
    }

    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }

    recognition.onerror = () => {
      setListening(false)
      recognitionRef.current = null
    }

    recognition.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  function toggleVoice() {
    if (listening) stopListening()
    else startListening()
  }

  function sendMessage() {
    const text = input.trim()
    if (!text || thinking) return
    if (listening) stopListening()

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text, ts: Date.now() }])
    setInput('')
    setThinking(true)

    setTimeout(() => {
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'ai', text: getDemoResponse(text), ts: Date.now() }])
      setThinking(false)
    }, 1200)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <aside className="flex h-full w-80 flex-col bg-white border-l border-gray-100 shadow-xl">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-gray-100 px-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="size-4 text-primary" />
        </div>
        <span className="flex-1 text-sm font-semibold text-gray-800">AI Assistant</span>
        <button
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={cn('flex flex-col gap-1', msg.role === 'user' ? 'items-end' : 'items-start')}>
              <div className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                msg.role === 'user' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-800',
              )}>
                {msg.text}
              </div>
              <span className="px-1 text-[11px] text-gray-400">{timeAgo(msg.ts)}</span>
            </div>
          ))}
          {thinking && (
            <div className="flex items-start">
              <div className="rounded-2xl bg-gray-100 px-4 py-3">
                <BouncingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="shrink-0 border-t border-gray-100 p-3">
        {/* Voice indicator */}
        {listening && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5">
            <span className="size-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-600 font-medium">Listening…</span>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={listening ? 'Speak now…' : 'Ask about your files...'}
            rows={2}
            className="resize-none rounded-xl text-sm leading-snug"
          />
          <div className="flex flex-col gap-1.5">
            {/* Voice button */}
            {voiceSupported && (
              <button
                onClick={toggleVoice}
                title={listening ? 'Stop listening' : 'Voice input'}
                className={`flex size-9 items-center justify-center rounded-xl transition-colors ${
                  listening
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                }`}
              >
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </button>
            )}
            {/* Send button */}
            <Button
              size="sm"
              className="size-9 p-0 rounded-xl shrink-0"
              onClick={sendMessage}
              disabled={!input.trim() || thinking}
            >
              <SendHorizonal className="size-4" />
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">Enter to send · Shift+Enter for new line</p>
      </div>
    </aside>
  )
}
