'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { apiSupportChat, type SupportResponse } from '@/lib/api'
import { SUPPORT_EMAIL } from '@/lib/contact'

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: { escalated?: boolean; category?: string; ticketId?: string }
}

export default function SupportPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm the Mini Manager support agent. How can I help you today? I can answer questions about features, billing, or troubleshoot issues.",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setLoading(true)

    try {
      const res: SupportResponse = await apiSupportChat(text)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.reply,
        meta: { escalated: res.escalated, category: res.category, ticketId: res.ticket_id },
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again or email {SUPPORT_EMAIL}.',
        meta: { escalated: true },
      }])
    }

    setLoading(false)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Support</h1>
        <p className="text-sm text-muted-foreground mt-0.5">AI-powered support — escalates to a human only when needed</p>
      </div>

      {/* Chat window */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-card p-4 space-y-4 mb-3">
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="size-3.5 text-primary" />
              </div>
            )}
            <div className={cn('max-w-[80%] space-y-1.5', msg.role === 'user' ? 'items-end flex flex-col' : '')}>
              <div className={cn(
                'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-primary text-white rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm',
              )}>
                {msg.content}
              </div>
              {msg.meta && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {msg.meta.category && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 capitalize">
                      {msg.meta.category}
                    </Badge>
                  )}
                  {msg.meta.escalated && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                      <AlertCircle className="size-2.5" />Escalated to team
                    </span>
                  )}
                  {msg.meta.ticketId && (
                    <span className="text-[10px] text-muted-foreground">#{msg.meta.ticketId.slice(0, 8)}</span>
                  )}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="size-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <User className="size-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="size-3.5 text-primary" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          placeholder="Describe your issue…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          disabled={loading}
          className="flex-1"
          autoFocus
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()} size="icon">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  )
}

