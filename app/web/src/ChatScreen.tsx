import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Chat-first conversation surface (milestone 16). The sidebar (AppShell) owns
 * the session list; this screen renders one conversation filling the main
 * pane, with a sticky bottom composer — in the style of the Claude/ChatGPT/
 * Gemini web apps. Landing behaviour: `auto` opens the most recently active
 * chat (rewriting the URL) or falls through to the new-chat state; `new`
 * always starts fresh and creates the session on the first send, deriving the
 * title from the message.
 */

interface ChatSession { id: string, title: string, status: string, providerProfileId: string | null }
interface ChatEvent { seq: number, type: string, payload: unknown }
interface ProviderProfile { id: string, displayName: string, isDefault: boolean, enabled: boolean }

interface PendingApproval { toolCallId: string, toolName: string }

export type ChatMode = { kind: 'auto' } | { kind: 'new' } | { kind: 'session', id: string }

async function getJson (url: string): Promise<Response> {
  return await fetch(url, { credentials: 'same-origin' })
}
async function sendJson (method: string, url: string, body?: unknown): Promise<Response> {
  return await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** A transcript line derived from the raw event stream. */
interface Line { key: string, role: 'user' | 'assistant' | 'system', text: string }

function payloadText (payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') return undefined
  const p = payload as Record<string, unknown>
  if (typeof p.text === 'string') return p.text
  const event = p.event as Record<string, unknown> | undefined
  if (event !== undefined && typeof event.text === 'string') return event.text
  return undefined
}

/** Fold the event log into transcript lines. Assistant text is cumulative. */
function toTranscript (events: ChatEvent[]): { lines: Line[], approvals: PendingApproval[] } {
  const lines: Line[] = []
  const approvals = new Map<string, PendingApproval>()
  let assistant: Line | null = null
  for (const e of events) {
    if (e.type === 'user_message') {
      assistant = null
      lines.push({ key: `u-${e.seq}`, role: 'user', text: payloadText(e.payload) ?? '' })
    } else if (e.type === 'chunk' || e.type === 'agent_event') {
      const text = payloadText(e.payload)
      if (text === undefined || text === '') continue
      if (assistant === null) { assistant = { key: `a-${e.seq}`, role: 'assistant', text }; lines.push(assistant) } else { assistant.text = text }
    } else if (e.type === 'approval_request') {
      const p = e.payload as { toolCallId?: string, toolName?: string }
      if (typeof p?.toolCallId === 'string') approvals.set(p.toolCallId, { toolCallId: p.toolCallId, toolName: p.toolName ?? 'tool' })
    } else if (e.type === 'approval_resolved' || e.type === 'approval_auto_denied') {
      const p = e.payload as { toolCallId?: string }
      if (typeof p?.toolCallId === 'string') approvals.delete(p.toolCallId)
    } else if (e.type === 'compaction') {
      assistant = null
      lines.push({ key: `c-${e.seq}`, role: 'system', text: 'Context compacted' })
    } else if (e.type === 'ended') {
      assistant = null
    }
  }
  return { lines, approvals: [...approvals.values()] }
}

/** Derive a session title from the first message, ChatGPT-style. */
function titleFrom (text: string): string {
  const firstLine = text.trim().split('\n')[0] ?? ''
  return firstLine.length > 48 ? `${firstLine.slice(0, 47)}…` : (firstLine === '' ? 'New chat' : firstLine)
}

interface LockState { held: boolean, stale: boolean, lock: { sessionId: string | null, operation: string | null } | null }

export function ChatScreen ({ mode }: { mode: ChatMode }) {
  const [providers, setProviders] = useState<ProviderProfile[]>([])
  const [workflows, setWorkflows] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(mode.kind === 'session' ? mode.id : null)
  const [ready, setReady] = useState(mode.kind !== 'auto')
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('normal')
  const [lockState, setLockState] = useState<LockState | null>(null)
  const streamAbort = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Stream events for the active session (replay + live) via a fetch stream.
  const openStream = useCallback((id: string) => {
    streamAbort.current?.abort()
    const abort = new AbortController()
    streamAbort.current = abort
    setEvents([])
    const pump = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/chat/sessions/${id}/events`, { credentials: 'same-origin', signal: abort.signal })
        if (res.status === 401) { window.location.assign('/login'); return }
        if (!res.ok || res.body === null) { setError('Could not open the chat stream.'); return }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const frames = buf.split('\n\n')
          buf = frames.pop() ?? ''
          for (const frame of frames) {
            const dataLine = frame.split('\n').find(l => l.startsWith('data:'))
            if (dataLine === undefined) continue
            try {
              const event = JSON.parse(dataLine.slice(5).trim()) as ChatEvent
              setEvents(prev => [...prev, event])
            } catch { /* ignore heartbeats / partial frames */ }
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setError('Chat stream disconnected.')
      }
    }
    pump().catch(() => {})
  }, [])

  useEffect(() => {
    if (mode.kind === 'session') {
      openStream(mode.id)
    } else if (mode.kind === 'auto') {
      // Landing: open the most recently active chat, or show the new-chat state.
      getJson('/api/chat/sessions').then(async res => {
        if (res.status === 401) { window.location.assign('/login'); return }
        const list = res.ok ? (await res.json() as { sessions: ChatSession[] }).sessions : []
        const latest = list[0]
        if (latest !== undefined) {
          window.history.replaceState(null, '', `/chat/${latest.id}`)
          window.dispatchEvent(new Event('chats-changed'))
          setActiveId(latest.id)
          openStream(latest.id)
        }
        setReady(true)
      }).catch(() => { setError('Could not load chats.'); setReady(true) })
    }
    getJson('/api/providers').then(async r => r.ok ? (await r.json() as { profiles: ProviderProfile[] }).profiles : [])
      .then(setProviders).catch(() => {})
    getJson('/api/chat/workflows').then(async r => r.ok ? (await r.json() as { workflows: string[] }).workflows : [])
      .then(setWorkflows).catch(() => {})
  }, [openStream]) // mode is stable per page load (no client-side router)

  useEffect(() => () => streamAbort.current?.abort(), [])

  // Keep the newest message in view as events stream in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [events])

  useEffect(() => {
    let active = true
    const poll = async () => {
      for (;;) {
        if (!active) break
        try {
          const res = await getJson('/api/vault/lock')
          if (res.ok) setLockState(await res.json() as LockState)
        } catch { /* ignore */ }
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
    poll().catch(() => {})
    return () => { active = false }
  }, [])

  async function send () {
    const text = input.trim()
    if (text === '') return
    setInput('')
    setError(null)

    let id = activeId
    if (id === null) {
      // New-chat state: create the session on first send, title from the message.
      const providerProfileId = selectedProvider === '' ? undefined : selectedProvider
      const res = await sendJson('POST', '/api/chat/sessions', { title: titleFrom(text), providerProfileId, approvalPreset: selectedPreset })
      if (res.status === 401) { window.location.assign('/login'); return }
      if (!res.ok) {
        setInput(text)
        setError((await res.json().catch(() => ({})) as { error?: string }).error ?? 'Could not start a chat.')
        return
      }
      const session = await res.json() as ChatSession
      id = session.id
      setActiveId(id)
      window.history.replaceState(null, '', `/chat/${id}`)
      window.dispatchEvent(new Event('chats-changed'))
      openStream(id)
    }

    const res = await sendJson('POST', `/api/chat/sessions/${id}/messages`, { text })
    if (!res.ok) setError('Message could not be sent.')
  }

  async function runWorkflow (name: string) {
    if (activeId === null) { setError('Send a message to start this chat first.'); return }
    const res = await sendJson('POST', `/api/chat/sessions/${activeId}/commands`, { command: name })
    if (!res.ok) setError(`Could not run the "${name}" workflow.`)
  }

  async function resolveApproval (toolCallId: string, approved: boolean) {
    if (activeId === null) return
    await sendJson('POST', `/api/chat/sessions/${activeId}/approvals/${toolCallId}`, { approved })
  }

  async function compactContext () {
    if (activeId === null) return
    const res = await sendJson('POST', `/api/chat/sessions/${activeId}/compact`)
    if (!res.ok) setError('Could not request context compaction.')
  }

  const { lines, approvals } = toTranscript(events)
  const newChatState = ready && activeId === null

  return (
    <div className='chat-pane' data-testid='chat-pane'>
      <div className='chat-scroll' ref={scrollRef}>
        {error !== null && (
          <div className='alert alert-danger chat-alert' role='alert'>
            <span className='alert-title'>Chat</span>
            <span data-testid='chat-error'>{error}</span>
          </div>
        )}

        {newChatState && (
          <div className='chat-welcome' data-testid='new-chat-state'>
            <img src='/design/assets/logo-mark.svg' alt='' />
            <h1>What can I help with?</h1>
            <p>Messages go to your executive secretary, who can read and update your vault.</p>
            <div className='chat-welcome-options'>
              <label>
                <span>Provider</span>
                <select className='select' value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
                  <option value=''>Default provider</option>
                  {providers.filter(p => p.enabled).map(p => (
                    <option key={p.id} value={p.id}>{p.displayName}{p.isDefault ? ' (default)' : ''}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Approvals</span>
                <select className='select' value={selectedPreset} onChange={e => setSelectedPreset(e.target.value)}>
                  <option value='normal'>Normal</option>
                  <option value='read-only'>Read-only</option>
                  <option value='high-trust'>High-trust</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {!newChatState && (
          <div className='chat-thread' data-testid='transcript'>
            {lines.map(l => (
              l.role === 'system'
                ? <div key={l.key} className='chat-divider'><span>{l.text}</span></div>
                : (
                  <div key={l.key} className={`chat-msg chat-msg-${l.role}`}>
                    {l.role === 'assistant' && <span className='chat-msg-author'>Secretary</span>}
                    <div className='chat-bubble'>{l.text}</div>
                  </div>
                  )
            ))}
            {lines.length === 0 && ready && <p className='chat-empty'>No messages yet. Say hello.</p>}
          </div>
        )}

        {approvals.map(a => (
          <div key={a.toolCallId} className='alert alert-warn chat-alert' role='status'>
            <span className='alert-title'>Approve {a.toolName}?</span>
            <span className='chat-approval-actions'>
              <button className='btn btn-primary btn-sm' type='button' onClick={() => { resolveApproval(a.toolCallId, true).catch(() => {}) }}>Approve</button>
              <button className='btn btn-secondary btn-sm' type='button' onClick={() => { resolveApproval(a.toolCallId, false).catch(() => {}) }}>Deny</button>
            </span>
          </div>
        ))}
      </div>

      <div className='chat-composer-wrap'>
        {activeId !== null && (
          <div className='chat-toolbar' data-testid='workflow-bar'>
            {workflows.map(w => (
              <button key={w} className='chat-chip' type='button' onClick={() => { runWorkflow(w).catch(() => {}) }}>/{w}</button>
            ))}
            <button className='chat-chip' type='button' data-testid='compact-btn' onClick={() => { compactContext().catch(() => {}) }}>Compact context</button>
            {lockState?.held && (
              <span className={`chat-lock${lockState.lock?.sessionId === activeId ? ' is-mine' : ''}`}>
                {lockState.lock?.sessionId === activeId ? 'Write lock held' : 'Vault locked by another session'}
              </span>
            )}
          </div>
        )}
        <form className='chat-composer' onSubmit={e => { e.preventDefault(); send().catch(() => {}) }} aria-label='Message composer'>
          <textarea
            className='chat-input' rows={2} value={input} data-testid='composer'
            placeholder='Message your secretary…' aria-label='Message'
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send().catch(() => {}) }
            }}
          />
          <button className='btn btn-primary chat-send' type='submit' disabled={input.trim() === ''}>Send</button>
        </form>
      </div>
    </div>
  )
}
