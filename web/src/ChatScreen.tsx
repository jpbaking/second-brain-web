import { useCallback, useEffect, useRef, useState } from 'react'

interface ChatSession { id: string, title: string, status: string, providerProfileId: string | null }
interface ChatEvent { seq: number, type: string, payload: unknown }
interface ProviderProfile { id: string, displayName: string, isDefault: boolean, enabled: boolean }

interface PendingApproval { toolCallId: string, toolName: string }

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
      lines.push({ key: `c-${e.seq}`, role: 'system', text: '— Context Compacted —' })
    } else if (e.type === 'ended') {
      assistant = null
    }
  }
  return { lines, approvals: [...approvals.values()] }
}

export function ChatScreen () {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [providers, setProviders] = useState<ProviderProfile[]>([])
  const [workflows, setWorkflows] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState('')
  const streamAbort = useRef<AbortController | null>(null)

  const loadSessions = useCallback(async () => {
    const res = await getJson('/api/chat/sessions')
    if (res.status === 401) { window.location.assign('/login'); return }
    if (res.ok) setSessions((await res.json() as { sessions: ChatSession[] }).sessions)
  }, [])

  useEffect(() => {
    loadSessions().catch(() => setError('Could not load chats.'))
    getJson('/api/providers').then(async r => r.ok ? (await r.json() as { profiles: ProviderProfile[] }).profiles : [])
      .then(setProviders).catch(() => {})
    getJson('/api/chat/workflows').then(async r => r.ok ? (await r.json() as { workflows: string[] }).workflows : [])
      .then(setWorkflows).catch(() => {})
  }, [loadSessions])

  // Stream events for the active session (replay + live) via a fetch stream.
  const openStream = useCallback((id: string) => {
    streamAbort.current?.abort()
    const abort = new AbortController()
    streamAbort.current = abort
    setEvents([])
    const pump = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/chat/sessions/${id}/events`, { credentials: 'same-origin', signal: abort.signal })
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

  function selectSession (id: string) {
    setActiveId(id)
    setError(null)
    openStream(id)
  }

  useEffect(() => () => streamAbort.current?.abort(), [])

  async function newChat () {
    setError(null)
    const providerProfileId = selectedProvider === '' ? undefined : selectedProvider
    const res = await sendJson('POST', '/api/chat/sessions', { title: 'New chat', providerProfileId })
    if (res.status === 401) { window.location.assign('/login'); return }
    if (!res.ok) { setError((await res.json().catch(() => ({})) as { error?: string }).error ?? 'Could not start a chat.'); return }
    const session = await res.json() as ChatSession
    await loadSessions()
    selectSession(session.id)
  }

  async function send () {
    if (activeId === null || input.trim() === '') return
    const text = input.trim()
    setInput('')
    const res = await sendJson('POST', `/api/chat/sessions/${activeId}/messages`, { text })
    if (!res.ok) setError('Message could not be sent.')
  }

  async function runWorkflow (name: string) {
    if (activeId === null) { setError('Start or select a chat first.'); return }
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

  return (
    <div className='app-page'>
      <header className='app-hero'>
        <a className='app-brand' href='/' aria-label='Second Brain home'>
          <img src='/design/assets/logo-mark-invert.svg' alt='' />
          <span className='app-wordmark'>Second Brain</span>
        </a>
        <p className='app-kicker'>Private console</p>
        <h1 className='app-title'>Chat</h1>
        <p className='app-tagline'>Talk to your executive secretary and run vault workflows.</p>
      </header>

      <main className='action-card'>
        {error !== null && (
          <div className='alert alert-danger' role='alert'>
            <span className='alert-title'>Chat</span>
            <span data-testid='chat-error'>{error}</span>
          </div>
        )}

        <section className='stack-2' aria-label='New chat'>
          <div className='input-row'>
            <div className='field'>
              <label className='label' htmlFor='provider'>Provider</label>
              <select id='provider' className='input' value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
                <option value=''>Default provider</option>
                {providers.filter(p => p.enabled).map(p => (
                  <option key={p.id} value={p.id}>{p.displayName}{p.isDefault ? ' (default)' : ''}</option>
                ))}
              </select>
            </div>
            <div className='field' style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className='btn btn-primary' type='button' data-testid='new-chat' onClick={() => { newChat().catch(() => {}) }}>New chat</button>
            </div>
          </div>
        </section>

        <section className='stack-2' aria-label='Chats'>
          <h2 className='card-title'>Chats</h2>
          {sessions.length === 0
            ? <p className='app-tagline'>No chats yet. Start one above.</p>
            : (
              <ul className='data-list' data-testid='chat-list'>
                {sessions.map(s => (
                  <li key={s.id} className='data-row'>
                    <button
                      className='nav-link' type='button'
                      style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                      aria-current={s.id === activeId ? 'true' : undefined}
                      onClick={() => selectSession(s.id)}
                    >
                      {s.title}{s.status === 'closed' ? ' · closed' : ''}
                    </button>
                  </li>
                ))}
              </ul>
              )}
        </section>

        {activeId !== null && (
          <section className='stack-2' aria-label='Transcript'>
            <h2 className='card-title'>Transcript</h2>
            <div className='form-actions' style={{ margin: 0, flexWrap: 'wrap' }} data-testid='workflow-bar'>
              {workflows.map(w => (
                <button key={w} className='btn btn-secondary' type='button' onClick={() => { runWorkflow(w).catch(() => {}) }}>/{w}</button>
              ))}
              <button className='btn btn-secondary' type='button' data-testid='compact-btn' onClick={() => { compactContext().catch(() => {}) }}>Compact Context</button>
            </div>

            <div className='data-list' data-testid='transcript'>
              {lines.length === 0
                ? <p className='app-tagline'>No messages yet. Say hello.</p>
                : lines.map(l => (
                  <div key={l.key} className='data-row'>
                    <span className='data-key'>{l.role === 'user' ? 'You' : l.role === 'assistant' ? 'Secretary' : 'System'}</span>
                    <span className='data-value' style={{ whiteSpace: 'pre-wrap' }}>{l.text}</span>
                  </div>
                ))}
            </div>

            {approvals.map(a => (
              <div key={a.toolCallId} className='alert alert-warn' role='status'>
                <span className='alert-title'>Approve {a.toolName}?</span>
                <span className='form-actions' style={{ margin: 0 }}>
                  <button className='btn btn-primary' type='button' onClick={() => { resolveApproval(a.toolCallId, true).catch(() => {}) }}>Approve</button>
                  <button className='btn btn-secondary' type='button' onClick={() => { resolveApproval(a.toolCallId, false).catch(() => {}) }}>Deny</button>
                </span>
              </div>
            ))}

            <form onSubmit={e => { e.preventDefault(); send().catch(() => {}) }} aria-label='Message composer'>
              <div className='field'>
                <label className='label' htmlFor='composer'>Message</label>
                <textarea
                  id='composer' className='input' rows={3} value={input} data-testid='composer'
                  placeholder='Ask your secretary…' onChange={e => setInput(e.target.value)}
                />
              </div>
              <div className='form-actions'>
                <button className='btn btn-primary' type='submit' disabled={input.trim() === ''}>Send</button>
              </div>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}
