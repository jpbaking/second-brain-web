import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/atom-one-dark.css'
import { foldTranscript } from './chat-transcript.js'
import type { ChatEvent } from './chat-transcript.js'

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
interface ProviderProfile { id: string, displayName: string, isDefault: boolean, enabled: boolean }

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

const localDateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
const localDateTimeFull = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' })

function messageTime (createdAt?: string) {
  if (createdAt === undefined) return null
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  return <time className='chat-time' dateTime={createdAt} title={localDateTimeFull.format(date)}>{localDateTime.format(date)}</time>
}

/** Derive a session title from the first message, ChatGPT-style. */
function titleFrom (text: string): string {
  const firstLine = text.trim().split('\n')[0] ?? ''
  return firstLine.length > 48 ? `${firstLine.slice(0, 47)}…` : (firstLine === '' ? 'New chat' : firstLine)
}

interface LockState { held: boolean, stale: boolean, lock: { sessionId: string | null, operation: string | null } | null }

// suppressErrorRendering stops mermaid appending "bomb" error SVGs to
// document.body when given an incomplete chart mid-stream; failures still
// throw and are handled inline by <Mermaid>.
mermaid.initialize({ startOnLoad: false, theme: 'default', suppressErrorRendering: true })

// True while the containing assistant message is still streaming: a mermaid
// chart that fails to parse is then merely unfinished, not broken.
const StreamingContext = createContext(false)

// Full-window preview of a diagram or code block, opened by clicking it in
// the transcript. The markdown component map is module-level (stable identity,
// see markdownComponents), so the opener is passed down via context.
type ZoomContent =
  | { kind: 'mermaid', chart: string }
  | { kind: 'code', code: string, lang: string | null }
  | { kind: 'table', children: ReactNode }
const ZoomContext = createContext<(content: ZoomContent) => void>(() => {})

// Plain text of a hast element node (react-markdown's `node` prop).
function hastText (node: unknown): string {
  if (node === null || typeof node !== 'object') return ''
  const n = node as { type?: string, value?: string, children?: unknown[] }
  if (n.type === 'text') return n.value ?? ''
  return (n.children ?? []).map(hastText).join('')
}

// Icon-only button copying the raw markdown source of a block. Clicks must
// not bubble: the block underneath opens the zoom modal.
function CopyButton ({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type='button'
      className='chat-copy-btn'
      aria-label='Copy source'
      title='Copy source'
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }).catch(() => {})
      }}
    >
      {copied
        ? <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><path d='M20 6 9 17l-5-5' /></svg>
        : <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><rect x='9' y='9' width='13' height='13' rx='2' /><path d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' /></svg>}
    </button>
  )
}

// Fenced code block: line numbers (CSS counters, excluded from copy/select)
// and a copy button; clicking opens the zoom modal when zoomable.
function CodeBlock ({ code, lang, zoomable = false }: { code: string, lang: string | null, zoomable?: boolean }) {
  const openZoom = useContext(ZoomContext)
  // highlight.js escapes the input, so the produced HTML is safe to inject.
  const highlighted = useMemo(() => {
    if (lang !== null && hljs.getLanguage(lang) !== undefined) {
      try { return hljs.highlight(code, { language: lang }).value } catch { /* fall through to plain */ }
    }
    return null
  }, [code, lang])
  return (
    <div className='chat-codeblock'>
      <CopyButton text={code} />
      <pre
        style={zoomable ? { cursor: 'zoom-in' } : undefined}
        title={zoomable ? 'Click to expand' : undefined}
        onClick={zoomable ? () => openZoom({ kind: 'code', code, lang }) : undefined}
      >
        <span className='chat-code-gutter' aria-hidden='true'>
          {code.split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}
        </span>
        {highlighted === null
          ? <code className={lang === null ? undefined : `language-${lang}`}>{code}</code>
          : <code className={`hljs language-${lang}`} dangerouslySetInnerHTML={{ __html: highlighted }} />}
      </pre>
    </div>
  )
}

// zoomable: clicking opens the zoom modal (transcript). pannable: scroll
// wheel zooms and dragging pans, instead of scrolling (inside the modal).
function Mermaid ({ chart, zoomable = false, pannable = false }: { chart: string, zoomable?: boolean, pannable?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const streaming = useContext(StreamingContext)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const drag = useRef<{ startX: number, startY: number, x: number, y: number } | null>(null)
  // Native listener: React registers wheel handlers passively, so an onWheel
  // prop could not preventDefault (the modal body would scroll instead).
  useEffect(() => {
    if (!pannable) return
    const el = viewportRef.current
    if (el === null) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setView(v => {
        const scale = Math.min(8, Math.max(0.25, v.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)))
        const rect = el.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        const k = scale / v.scale
        // Keep the point under the cursor fixed while zooming.
        return { scale, x: cx - k * (cx - v.x), y: cy - k * (cy - v.y) }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [pannable])
  useEffect(() => {
    let active = true
    const renderChart = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substring(2)}`
        const { svg } = await mermaid.render(id, chart)
        if (active && containerRef.current) {
          containerRef.current.innerHTML = svg
          // Pannable view: pin the svg to its natural size (mermaid emits
          // width:100%), then fit-and-centre it in the viewport as the
          // starting transform. Wheel/drag take it from there.
          const svgEl = containerRef.current.querySelector('svg')
          const vp = viewportRef.current
          if (pannable && svgEl !== null && vp !== null) {
            const vb = svgEl.viewBox.baseVal
            const w = vb.width > 0 ? vb.width : svgEl.getBoundingClientRect().width
            const h = vb.height > 0 ? vb.height : svgEl.getBoundingClientRect().height
            svgEl.style.width = `${w}px`
            svgEl.style.maxWidth = 'none'
            const scale = Math.min(1, vp.clientWidth / w, vp.clientHeight / h)
            setView({ scale, x: (vp.clientWidth - w * scale) / 2, y: Math.max(0, (vp.clientHeight - h * scale) / 2) })
          }
        }
      } catch (err) {
        if (!active || containerRef.current === null) return
        if (streaming) {
          // Partial chart mid-stream: keep the last good render (or a quiet
          // placeholder) instead of flashing a syntax error.
          if (containerRef.current.innerHTML === '') containerRef.current.innerText = 'Rendering diagram…'
        } else {
          containerRef.current.innerText = `Mermaid syntax error: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }
    renderChart().catch(() => {})
    return () => { active = false }
  }, [chart, streaming, pannable])
  const openZoom = useContext(ZoomContext)
  return (
    <div
      className='mermaid-diagram'
      style={{ background: 'var(--surface)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', cursor: zoomable ? 'zoom-in' : undefined }}
      title={zoomable ? 'Click to expand' : undefined}
      onClick={zoomable ? () => openZoom({ kind: 'mermaid', chart }) : undefined}
    >
      <CopyButton text={chart} />
      {pannable
        ? (
          <div
            ref={viewportRef}
            style={{ overflow: 'hidden', width: '100%', height: '100%', cursor: drag.current !== null ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
            onPointerDown={e => {
              drag.current = { startX: e.clientX, startY: e.clientY, x: view.x, y: view.y }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              const d = drag.current
              if (d === null) return
              setView(v => ({ ...v, x: d.x + e.clientX - d.startX, y: d.y + e.clientY - d.startY }))
            }}
            onPointerUp={e => { drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId) }}
          >
            <div ref={containerRef} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }} />
          </div>
          )
        : <div ref={containerRef} style={{ overflowX: 'auto' }} />}
    </div>
  )
}

// Stable component map: an inline object would give `code` a new identity on
// every render, making React remount each Mermaid diagram (visible flicker on
// every lock-poll re-render).
const markdownComponents = {
  code ({ node, className, children, ...props }: { node?: unknown, className?: string, children?: ReactNode }) {
    const match = /language-(\w+)/.exec(className ?? '')
    if (match !== null && match[1] === 'mermaid') {
      return <Mermaid chart={String(children).replace(/\n$/, '')} zoomable />
    }
    return <code className={className} {...props}>{children}</code>
  },
  pre ({ node, children }: { node?: unknown, children?: ReactNode }) {
    const codeNode = (node as { children?: Array<{ properties?: { className?: unknown } }> })?.children?.[0]
    const classNames = codeNode?.properties?.className
    const cls = Array.isArray(classNames) ? classNames.join(' ') : ''
    // Mermaid code blocks render as diagrams with their own click handling;
    // drop the <pre> wrapper entirely.
    if (cls.includes('language-mermaid')) return <>{children}</>
    const code = hastText(node).replace(/\n$/, '')
    const lang = /language-(\w+)/.exec(cls)?.[1] ?? null
    return <CodeBlock code={code} lang={lang} zoomable />
  },
  table ({ children }: { node?: unknown, children?: ReactNode }) {
    return <ZoomableTable>{children}</ZoomableTable>
  }
}

// Transcript table: clicking opens it in the zoom modal. The already-built
// React children are reused as the modal's content.
function ZoomableTable ({ children }: { children?: ReactNode }) {
  const openZoom = useContext(ZoomContext)
  return (
    <table
      style={{ cursor: 'zoom-in' }}
      title='Click to expand'
      onClick={() => openZoom({ kind: 'table', children })}
    >
      {children}
    </table>
  )
}

export function ChatScreen ({ mode }: { mode: ChatMode }) {
  const [providers, setProviders] = useState<ProviderProfile[]>([])
  const [workflows, setWorkflows] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(mode.kind === 'session' ? mode.id : null)
  const [ready, setReady] = useState(mode.kind !== 'auto')
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)
  // Optimistic "the agent is working on my request" flag. Set the instant the
  // user triggers agent work (send / workflow / approval / compact), cleared
  // when the turn ends or pauses for approval. Drives the processing indicator
  // independently of event-replay timing, so it always shows on send.
  const [pending, setPending] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('normal')
  const [slashIndex, setSlashIndex] = useState(0)
  const [lockState, setLockState] = useState<LockState | null>(null)
  const [zoom, setZoom] = useState<ZoomContent | null>(null)
  // Files attached but not yet sent. They upload during send() (a brand-new
  // chat has no session id to upload against until then) and clear with the
  // message; chips above the composer let the user drop one before sending.
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const streamAbort = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Auto-grow the composer with its content: one line when empty, up to the
  // CSS max-height (near half the screen), after which it scrolls. Keyed on
  // the value so clearing on send collapses it back to one line.
  useEffect(() => {
    const el = inputRef.current
    if (el === null) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [input])
  const zoomRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    if (zoom !== null) zoomRef.current?.showModal()
  }, [zoom])

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
            const isSync = frame.split('\n').some(l => l.startsWith('event: sync'))
            const dataLine = frame.split('\n').find(l => l.startsWith('data:'))
            if (dataLine === undefined) continue
            try {
              if (isSync) {
                const syncData = JSON.parse(dataLine.slice(5).trim()) as { live?: boolean }
                if (typeof syncData.live === 'boolean') setIsLive(syncData.live)
                continue
              }
              const event = JSON.parse(dataLine.slice(5).trim()) as ChatEvent
              if (event.type === 'ended') { setIsLive(false); setPending(false) } else if (event.type === 'approval_request') setPending(false)
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

  const loadSessionConfig = useCallback(async (id: string) => {
    const res = await getJson(`/api/chat/sessions/${id}`)
    if (!res.ok) return
    const { session } = await res.json() as { session: ChatSession & { approvalPreset: string } }
    setSelectedProvider(session.providerProfileId ?? '')
    setSelectedPreset(session.approvalPreset)
  }, [])

  useEffect(() => {
    if (mode.kind === 'session') {
      openStream(mode.id)
      loadSessionConfig(mode.id).catch(() => {})
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
          loadSessionConfig(latest.id).catch(() => {})
        }
        setReady(true)
      }).catch(() => { setError('Could not load chats.'); setReady(true) })
    }
    getJson('/api/providers').then(async r => r.ok ? (await r.json() as { profiles: ProviderProfile[] }).profiles : [])
      .then(setProviders).catch(() => {})
    getJson('/api/chat/workflows').then(async r => r.ok ? (await r.json() as { workflows: string[] }).workflows : [])
      .then(setWorkflows).catch(() => {})
  }, [openStream, loadSessionConfig]) // mode is stable per page load (no client-side router)

  useEffect(() => () => streamAbort.current?.abort(), [])

  // Keep the newest message in view as events stream in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [events])

  // Content keeps growing after that scroll: mermaid diagrams render
  // asynchronously and push the transcript taller. Track whether the user is
  // at the bottom, and re-pin whenever content height changes while they are.
  const stickToBottom = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (el === null) return
    const onScroll = () => {
      stickToBottom.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    if (el === null) return
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTo({ top: el.scrollHeight })
    })
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
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
    const files = pendingFiles
    setInput('')
    setPendingFiles([])
    setError(null)
    setIsLive(true)
    setPending(true)

    let id = activeId
    if (id === null) {
      // New-chat state: create the session on first send, title from the message.
      const providerProfileId = selectedProvider === '' ? undefined : selectedProvider
      const res = await sendJson('POST', '/api/chat/sessions', { title: titleFrom(text), providerProfileId, approvalPreset: selectedPreset })
      if (res.status === 401) { window.location.assign('/login'); return }
      if (!res.ok) {
        setInput(text)
        setPendingFiles(files)
        setPending(false)
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

    let attachmentIds: string[] | undefined
    if (files.length > 0) {
      const form = new FormData()
      for (const file of files) form.append('files', file, file.name)
      const upload = await fetch(`/api/chat/sessions/${id}/uploads`, { method: 'POST', credentials: 'same-origin', body: form })
      if (!upload.ok) {
        setInput(text)
        setPendingFiles(files)
        setPending(false)
        setError((await upload.json().catch(() => ({})) as { error?: string }).error ?? 'Attachments could not be uploaded.')
        return
      }
      attachmentIds = ((await upload.json()) as { attachments: Array<{ id: string }> }).attachments.map(a => a.id)
    }

    const res = await sendJson('POST', `/api/chat/sessions/${id}/messages`, { text, ...(attachmentIds !== undefined ? { attachmentIds } : {}) })
    if (!res.ok) { setPending(false); setError('Message could not be sent.') }
  }

  async function runWorkflow (name: string) {
    if (activeId === null) { setError('Send a message to start this chat first.'); return }
    setIsLive(true)
    setPending(true)
    const res = await sendJson('POST', `/api/chat/sessions/${activeId}/commands`, { command: name })
    if (!res.ok) { setPending(false); setError(`Could not run the "${name}" workflow.`) }
  }

  async function resolveApproval (toolCallId: string, approved: boolean) {
    if (activeId === null) return
    setIsLive(true)
    setPending(true)
    await sendJson('POST', `/api/chat/sessions/${activeId}/approvals/${toolCallId}`, { approved })
  }

  async function compactContext () {
    if (activeId === null) return
    setIsLive(true)
    setPending(true)
    const res = await sendJson('POST', `/api/chat/sessions/${activeId}/compact`)
    if (!res.ok) { setPending(false); setError('Could not request context compaction.') }
  }

  async function updateConfig (providerProfileId: string, approvalPreset: string) {
    setSelectedProvider(providerProfileId)
    setSelectedPreset(approvalPreset)
    if (activeId === null || providerProfileId === '') return
    const res = await sendJson('PATCH', `/api/chat/sessions/${activeId}`, { providerProfileId, approvalPreset })
    if (!res.ok) setError('Could not update chat settings.')
  }

  async function abortTurn () {
    if (activeId === null) return
    const res = await sendJson('POST', `/api/chat/sessions/${activeId}/abort`)
    if (res.ok) { setPending(false); setIsLive(false) } else setError('Could not abort the active turn.')
  }

  const { lines, approvals, isProcessing, statusText } = foldTranscript(events, isLive)
  // Show the indicator either from the optimistic local flag (just sent) or from
  // the live event stream (mounted into an in-progress turn).
  const showProcessing = (pending || isProcessing) && approvals.length === 0
  const newChatState = ready && activeId === null
  const slashQuery = input.startsWith('/') && !input.includes(' ') ? input.slice(1).toLowerCase() : null
  const slashMatches = slashQuery === null ? [] : workflows.filter(name => name.toLowerCase().includes(slashQuery))

  function chooseSlash (name: string, run: boolean) {
    setInput(run ? '' : `/${name}`)
    setSlashIndex(0)
    if (run) runWorkflow(name).catch(() => {})
  }

  return (
    <ZoomContext.Provider value={setZoom}>
      {zoom !== null && (
        <dialog
          ref={zoomRef}
          className={`modal chat-zoom-modal${zoom.kind === 'mermaid' ? ' is-diagram' : ''}`}
          onClose={() => setZoom(null)}
          onClick={e => { if (e.target === e.currentTarget) zoomRef.current?.close() }}
        >
          <div className='modal-head'>
            <h2 className='modal-title'>{zoom.kind === 'mermaid' ? 'Diagram' : zoom.kind === 'table' ? 'Table' : `Code${zoom.lang !== null ? ` — ${zoom.lang}` : ''}`}</h2>
            <button type='button' className='modal-close' onClick={() => zoomRef.current?.close()}>Close</button>
          </div>
          <div className={`modal-body chat-zoom-body${zoom.kind !== 'mermaid' ? ' prose' : ''}`}>
            {zoom.kind === 'mermaid' && <Mermaid chart={zoom.chart} pannable />}
            {zoom.kind === 'code' && <CodeBlock code={zoom.code} lang={zoom.lang} />}
            {zoom.kind === 'table' && <table>{zoom.children}</table>}
          </div>
        </dialog>
      )}
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
            </div>
          )}

          {!newChatState && (
            <div className='chat-thread' data-testid='transcript'>
              {lines.map(l => (
                l.role === 'system'
                  ? <div key={l.key} className='chat-divider'><span>{l.text}</span></div>
                  : (
                    <div key={l.key} className={`chat-msg chat-msg-${l.role}`}>
                      <div className='chat-msg-meta'>
                        {l.role === 'assistant' && <span className='chat-msg-author'>Secretary</span>}
                        {messageTime(l.createdAt)}
                      </div>
                      {l.role === 'assistant' && ((l.reasoning ?? '') !== '' || (l.activities?.length ?? 0) > 0) && (
                        <details className={`chat-reasoning${l.complete === false ? ' is-active' : ''}`} open={l.complete === false ? true : undefined}>
                          <summary>{l.complete === false ? 'Working…' : ((l.reasoning ?? '') !== '' ? 'Reasoning and activity' : 'Activity details')}</summary>
                          {(l.activities?.length ?? 0) > 0 && <ul>{l.activities?.map((activity, index) => <li key={`${l.key}-activity-${index}`}><span>{activity.text}</span>{messageTime(activity.createdAt)}</li>)}</ul>}
                          {(l.reasoningBlocks?.length ?? 0) > 0 && <div className='chat-reasoning-blocks'>{l.reasoningBlocks?.map((block, index) => <section key={`${l.key}-reasoning-${index}`} className='chat-reasoning-content'>{messageTime(block.createdAt)}<div>{block.text}</div></section>)}</div>}
                        </details>
                      )}
                      {(l.attachments?.length ?? 0) > 0 && (
                        <div className='chat-attachments'>
                          {l.attachments?.map((attachment, index) => (
                            <span key={`${l.key}-att-${index}`} className='chat-attachment-chip'>{attachment.kind === 'image' ? '🖼 ' : '📎 '}{attachment.name}</span>
                          ))}
                        </div>
                      )}
                      {l.text !== '' && (
                        <div className={`chat-bubble${l.role === 'assistant' ? ' prose' : ''}`}>
                          {l.role === 'assistant'
                            ? (
                              <StreamingContext.Provider value={l.complete === false}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                  {l.text}
                                </ReactMarkdown>
                              </StreamingContext.Provider>
                              )
                            : l.text}
                        </div>
                      )}
                    </div>
                    )
              ))}
              {showProcessing && (
                <div className='chat-msg chat-msg-assistant'>
                  <span className='chat-msg-author'>Secretary</span>
                  <div className='chat-processing'>
                    <div className='chat-processing-spinner' />
                    <span>{statusText ?? 'Processing...'}</span>
                  </div>
                </div>
              )}
              {lines.length === 0 && !showProcessing && ready && <p className='chat-empty'>No messages yet. Say hello.</p>}
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
          {slashMatches.length > 0 && (
            <div className='chat-slash-menu' role='listbox' aria-label='Workflow commands'>
              {slashMatches.map((name, index) => <button key={name} type='button' role='option' aria-selected={index === slashIndex} className={index === slashIndex ? 'is-active' : ''} onMouseDown={e => { e.preventDefault(); chooseSlash(name, false) }}>/{name}</button>)}
            </div>
          )}
          {pendingFiles.length > 0 && (
            <div className='chat-attachments' data-testid='pending-attachments'>
              {pendingFiles.map((file, index) => (
                <span key={`${file.name}-${index}`} className='chat-attachment-chip'>
                  {file.name}
                  <button
                    type='button' aria-label={`Remove ${file.name}`} title='Remove'
                    onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== index))}
                  >×
                  </button>
                </span>
              ))}
            </div>
          )}
          <form className='chat-composer' onSubmit={e => { e.preventDefault(); send().catch(() => {}) }} aria-label='Message composer'>
            <input
              ref={fileRef} type='file' multiple hidden data-testid='attach-input'
              onChange={e => {
                const chosen = Array.from(e.target.files ?? [])
                if (chosen.length > 0) setPendingFiles(prev => [...prev, ...chosen])
                e.target.value = ''
              }}
            />
            <textarea
              ref={inputRef}
              className='chat-input' rows={1} value={input} data-testid='composer'
              placeholder='Message your secretary…' aria-label='Message'
              onChange={e => { setInput(e.target.value); setSlashIndex(0) }}
              onKeyDown={e => {
                if (slashMatches.length > 0 && e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(i => (i + 1) % slashMatches.length) } else if (slashMatches.length > 0 && e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(i => (i - 1 + slashMatches.length) % slashMatches.length) } else if (slashMatches.length > 0 && e.key === 'Tab') { e.preventDefault(); chooseSlash(slashMatches[slashIndex]!, false) } else if (slashMatches.length > 0 && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chooseSlash(slashMatches[slashIndex]!, true) } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send().catch(() => {}) }
              }}
            />
            <div className='chat-composer-bar'>
              <button
                className='chat-composer-icon' type='button'
                aria-label='Attach files' title='Attach files'
                onClick={() => fileRef.current?.click()}
              >
                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><path d='m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48' /></svg>
              </button>
              <div className='chat-composer-options'>
                <label className='chat-composer-select'>
                  Provider
                  <select value={selectedProvider} onChange={e => { updateConfig(e.target.value, selectedPreset).catch(() => {}) }}>
                    <option value=''>Default provider</option>
                    {providers.filter(p => p.enabled).map(p => (
                      <option key={p.id} value={p.id}>{p.displayName}{p.isDefault ? ' (default)' : ''}</option>
                    ))}
                  </select>
                </label>
                <label className='chat-composer-select'>
                  Approvals
                  <select value={selectedPreset} onChange={e => { updateConfig(selectedProvider || providers.find(p => p.isDefault)?.id || '', e.target.value).catch(() => {}) }}>
                    <option value='normal'>Normal</option>
                    <option value='read-only'>Read-only</option>
                    <option value='high-trust'>High-trust</option>
                  </select>
                </label>
              </div>
              {showProcessing
                ? (
                  <button className='chat-send is-abort' type='button' aria-label='Abort' title='Abort' onClick={() => { abortTurn().catch(() => {}) }}>
                    <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'><rect x='6' y='6' width='12' height='12' rx='2' /></svg>
                  </button>
                  )
                : (
                  <button className='chat-send' type='submit' aria-label='Send' title='Send' disabled={input.trim() === ''}>
                    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><path d='M12 19V5' /><path d='m5 12 7-7 7 7' /></svg>
                  </button>
                  )}
            </div>
          </form>
        </div>
      </div>
    </ZoomContext.Provider>
  )
}
