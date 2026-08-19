/**
 * Client for the Strands agent's streaming endpoint.
 *
 * `EventSource` cannot POST, and the agent needs a folder digest in the request
 * body, so this reads the SSE stream off `fetch` by hand.
 *
 * The important events are `tool` and `done`. A `tool` event is emitted as a
 * tool actually executes, so the panel can show a trace of real work rather
 * than steps the model narrated. That distinction is the whole point: the
 * previous implementation reported success whenever a reply arrived, for work
 * that had never happened.
 */

export interface AgentToolEvent {
  name: string
  input?: unknown
  id?: string
}

export interface AgentInterrupt {
  id: string
  name: string
  session_id?: string
  reason: {
    tool?: string
    question?: string
    options?: string[]
    files?: { name?: string; target?: string; why?: string; sensitivity?: string }[]
  }
}

export interface AgentStreamHandlers {
  onText?: (chunk: string) => void
  /** A tool has started running. Not a plan — it is executing. */
  onTool?: (tool: AgentToolEvent) => void
  /** The agent stopped to ask something. Resume with resumeAgent(). */
  onInterrupt?: (interrupt: AgentInterrupt) => void
  /** The turn finished. `toolsCalled` is what actually ran. */
  onDone?: (result: { toolsCalled: string[]; resumed?: boolean }) => void
  onError?: (message: string) => void
}

export interface AgentStreamRequest {
  message: string
  scanContext?: unknown
  preferences?: unknown
  sessionId?: string
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

function token(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('mm.token') ?? sessionStorage.getItem('mm.token')
}

/**
 * Read an SSE body, dispatching each complete event.
 *
 * Events are separated by a blank line and can arrive split across chunks, so
 * the buffer is only consumed up to the last complete separator — otherwise a
 * tool call that straddles a chunk boundary is silently dropped.
 */
async function consume(
  response: Response,
  handlers: AgentStreamHandlers,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The server sent no readable stream')

  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let split: number
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)

      let event = ''
      let data = ''
      for (const line of raw.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim()
        else if (line.startsWith('data: ')) data += line.slice(6)
      }
      if (!event || !data) continue

      let payload: any
      try {
        payload = JSON.parse(data)
      } catch {
        continue      // a malformed frame is not worth killing the stream over
      }

      switch (event) {
        case 'text':      handlers.onText?.(payload.text ?? ''); break
        case 'tool':      handlers.onTool?.(payload as AgentToolEvent); break
        case 'interrupt': handlers.onInterrupt?.(payload as AgentInterrupt); break
        case 'done':      handlers.onDone?.({
                            toolsCalled: payload.tools_called ?? [],
                            resumed: payload.resumed,
                          }); break
        case 'error':     handlers.onError?.(payload.message ?? 'Something went wrong'); break
      }
    }
  }
}

async function post(path: string, body: unknown, handlers: AgentStreamHandlers): Promise<void> {
  const jwt = token()
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      handlers.onError?.(
        response.status === 401
          ? 'Your session has ended. Please sign in again.'
          : `The assistant is unavailable (${response.status}). ${detail.slice(0, 120)}`,
      )
      return
    }

    await consume(response, handlers)
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err.message : 'Could not reach the assistant')
  }
}

/** Send a message and stream the agent's work back. */
export async function streamAgent(
  req: AgentStreamRequest,
  handlers: AgentStreamHandlers,
): Promise<void> {
  return post('/api/v1/agent/v2', {
    message: req.message,
    scan_context: req.scanContext ?? null,
    preferences: req.preferences ?? null,
    session_id: req.sessionId ?? null,
  }, handlers)
}

/** Answer a question the agent stopped to ask, and let it carry on. */
export async function resumeAgent(
  args: { sessionId: string; interruptId: string; response: string; scanContext?: unknown; preferences?: unknown },
  handlers: AgentStreamHandlers,
): Promise<void> {
  return post('/api/v1/agent/v2/resume', {
    session_id: args.sessionId,
    interrupt_id: args.interruptId,
    response: args.response,
    scan_context: args.scanContext ?? null,
    preferences: args.preferences ?? null,
  }, handlers)
}
