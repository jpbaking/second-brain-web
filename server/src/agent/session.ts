import { appendEvent, createSession, getSession, getSessionBySdkId, readEventsSince, setSdkSessionId, saveCompaction } from './chat-store.js'
import { toModelConfig } from './runner.js'
import { TOOL_POLICIES, evaluateTool, isMutatingTool } from './tool-policy.js'
import { acquireLock, heartbeatLock, releaseLock } from '../vault/lock.js'
import type { AgentRunner, AgentModelConfig, SdkApprovalRequest, ToolApprovalDecision } from './runner.js'
import type { ChatEvent, ChatSession } from './chat-store.js'
import type { ProviderSnapshot } from '../providers/snapshot.js'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Agent session backend (milestone 5A). Bridges a chat session (m5a-03 store) to
 * a live SDK session via the injected {@link AgentRunner}, and rehydrates after a
 * restart per findings m00-10 (readMessages + initialMessages → a fresh SDK
 * session id, remapped onto the same chat session).
 *
 * The provider config is *captured at start* as a non-secret `session_config`
 * event, so a later edit to the profile does not change a running/resumed
 * session's model or endpoint. The decrypted key lives only in memory and is
 * re-resolved from the profile at (re)start — never persisted in an event.
 */

/** Non-secret model config persisted with the session (NO apiKey). */
export interface CapturedConfig {
  providerProfileId: string
  providerId: string
  modelId: string
  baseUrl: string | null
  headers: Record<string, string> | null
}

export interface AgentSessionOptions {
  /** Resolve the (decrypted, in-memory) provider snapshot for a profile id, or the default when null. */
  snapshotFor: (profileId: string | null) => ProviderSnapshot | undefined
  /** Session cwd — the vault checkout, so `.clinerules` auto-load (findings m00-10). */
  vaultCwd: string
  systemPrompt?: string
  enableTools?: boolean
}

/** A subscribe() envelope from the SDK (loose — exact shape bound at runtime). */
export interface SdkEnvelope {
  type?: string
  sessionId?: string
  payload?: { sessionId?: string, event?: { type?: string, text?: string } } & Record<string, unknown>
}

/**
 * Map an SDK subscribe envelope to a persisted chat event, or null to ignore.
 * The SDK envelope types (status / agent_event / chunk / session_snapshot /
 * ended) map onto our SSE event types; agent_event carries an inner event whose
 * `text` is cumulative assistant output (findings m00-10 #9).
 */
export function translateSdkEvent (env: SdkEnvelope): { type: string, payload: unknown } | null {
  switch (env.type) {
    case 'agent_event':
      return { type: 'agent_event', payload: env.payload?.event ?? null }
    case 'chunk':
      return { type: 'chunk', payload: env.payload ?? null }
    case 'status':
      return { type: 'status', payload: env.payload ?? null }
    case 'session_snapshot':
      return { type: 'session_snapshot', payload: env.payload ?? null }
    case 'ended':
      return { type: 'ended', payload: env.payload ?? null }
    default:
      return null
  }
}

/** Extract the SDK session id from an envelope (top-level or nested). */
function envelopeSdkSessionId (env: SdkEnvelope): string | undefined {
  return env.sessionId ?? env.payload?.sessionId
}

function capturedFromSnapshot (snap: ProviderSnapshot): CapturedConfig {
  return {
    providerProfileId: snap.profileId,
    providerId: snap.providerId,
    modelId: snap.modelId,
    baseUrl: snap.baseUrl,
    headers: snap.headers,
  }
}

export class AgentSessionService {
  /** chatSessionId → live SDK session id (this process only). */
  private readonly live = new Map<string, string>()
  /** chatSessionId → SSE listeners for live events. */
  private readonly subscribers = new Map<string, Set<(event: ChatEvent) => void>>()
  /** sdkSessionId → buffered events before session mapping is established */
  private readonly earlyEvents = new Map<string, SdkEnvelope[]>()
  /** toolCallId → parked approval resolver awaiting a human decision. */
  private readonly pendingApprovals = new Map<string, { resolve: (d: ToolApprovalDecision) => void, chatSessionId: string, toolName: string }>()
  /** chatSessionId → vault lockId held by this session. */
  private readonly locks = new Map<string, string>()
  private readonly unsubscribeRunner: () => void

  constructor (
    private readonly db: DatabaseSync,
    private readonly runner: AgentRunner,
    private readonly opts: AgentSessionOptions
  ) {
    // One global subscription bridges every SDK session event into the store
    // and out to connected SSE clients.
    this.unsubscribeRunner = this.runner.subscribe((event) => { this.handleSdkEvent(event as SdkEnvelope) })
  }

  /** Persist an SDK event against its chat session and fan it out to SSE clients. */
  private handleSdkEvent (env: SdkEnvelope): void {
    const sdkSessionId = envelopeSdkSessionId(env)
    if (sdkSessionId === undefined) return
    const session = getSessionBySdkId(this.db, sdkSessionId)
    if (session === undefined) {
      let buffered = this.earlyEvents.get(sdkSessionId)
      if (!buffered) {
        buffered = []
        this.earlyEvents.set(sdkSessionId, buffered)
      }
      buffered.push(env)
      return
    }
    const translated = translateSdkEvent(env)
    if (translated === null) return
    const event = appendEvent(this.db, session.id, translated.type, translated.payload)
    this.fanOut(session.id, event)

    if (translated.type === 'ended') {
      this.live.delete(session.id)
      this.checkCompaction(session.id)
      const lockId = this.locks.get(session.id)
      if (lockId !== undefined) {
        releaseLock(this.db, lockId)
        this.locks.delete(session.id)
      }
    } else {
      const lockId = this.locks.get(session.id)
      if (lockId !== undefined) {
        heartbeatLock(this.db, lockId)
      }
    }
  }

  private checkCompaction (chatSessionId: string): void {
    const events = readEventsSince(this.db, chatSessionId, 0)
    let reqIndex = -1
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      if (!ev) continue
      if (ev.type === 'compaction_requested') { reqIndex = i; break }
      if (ev.type === 'user_message') break // Stopped looking (another user turn).
    }
    if (reqIndex !== -1) {
      let text = ''
      for (let i = reqIndex + 1; i < events.length; i++) {
        const e = events[i]
        if (!e) continue
        if (e.type === 'chunk' || e.type === 'agent_event') {
          const payload = e.payload as { text?: string, event?: { text?: string } } | null
          if (typeof payload?.text === 'string') text += payload.text
          else if (typeof payload?.event?.text === 'string') text += payload.event.text
        }
      }
      const match = text.match(/<compaction_summary>([\s\S]*?)<\/compaction_summary>/)
      if (match && match[1] !== undefined) {
        // Prevent duplicate compactions if multiple 'ended' happen for the same turn.
        const summary = match[1].trim()
        const alreadyCompacted = events.slice(reqIndex).some(e => e?.type === 'compaction')
        if (!alreadyCompacted) {
          saveCompaction(this.db, chatSessionId, summary)
          this.emitEvent(chatSessionId, 'compaction', { summary })
        }
      }
    }
  }

  private fanOut (chatSessionId: string, event: ChatEvent): void {
    const set = this.subscribers.get(chatSessionId)
    if (set === undefined) return
    for (const listener of set) {
      try { listener(event) } catch { /* a slow/broken client must not break persistence */ }
    }
  }

  /** Subscribe to live events for a chat session (SSE). Returns an unsubscribe. */
  onEvent (chatSessionId: string, listener: (event: ChatEvent) => void): () => void {
    let set = this.subscribers.get(chatSessionId)
    if (set === undefined) { set = new Set(); this.subscribers.set(chatSessionId, set) }
    set.add(listener)
    return () => {
      const s = this.subscribers.get(chatSessionId)
      if (s === undefined) return
      s.delete(listener)
      if (s.size === 0) this.subscribers.delete(chatSessionId)
    }
  }

  /** Stop bridging SDK events (call on app shutdown). */
  dispose (): void {
    this.unsubscribeRunner()
    this.subscribers.clear()
    // Fail any parked approvals closed rather than leaving turns hung.
    for (const { resolve } of this.pendingApprovals.values()) resolve({ approved: false, reason: 'server shutting down' })
    this.pendingApprovals.clear()
    for (const lockId of this.locks.values()) releaseLock(this.db, lockId)
    this.locks.clear()
  }

  private ensureLock (sessionId: string, toolName: string): boolean {
    if (this.locks.has(sessionId)) return true
    const lockRes = acquireLock(this.db, { sessionId, operation: toolName })
    if (lockRes.acquired && lockRes.lock !== null) {
      this.locks.set(sessionId, lockRes.lock.lockId)
      return true
    }
    return false
  }

  /**
   * The SDK approval entry point (spike m00-06). The mandatory library/ guard
   * (m5a-02) runs first: a hard deny is auto-refused without ever parking; an
   * auto-allow returns immediately; otherwise the promise is parked keyed by
   * toolCallId and an `approval_request` event is streamed for the human.
   */
  async requestToolApproval (req: SdkApprovalRequest): Promise<ToolApprovalDecision> {
    const sdkSessionId = req.sessionId
    const session = sdkSessionId === undefined ? undefined : getSessionBySdkId(this.db, sdkSessionId)
    const preset = session?.approvalPreset ?? 'normal'
    const decision = evaluateTool({ toolName: req.toolName, input: req.input ?? null }, preset)

    if (decision.decision === 'deny') {
      if (session !== undefined) {
        this.emitEvent(session.id, 'approval_auto_denied', { toolName: req.toolName, reason: decision.reason })
      }
      return { approved: false, ...(decision.reason !== undefined ? { reason: decision.reason } : {}) }
    }
    if (decision.decision === 'allow') {
      if (session !== undefined && isMutatingTool(req.toolName)) {
        if (!this.ensureLock(session.id, req.toolName)) {
          return { approved: false, reason: 'Another session holds the vault lock.' }
        }
      }
      return { approved: true }
    }

    // 'ask' → park for a human decision.
    const toolCallId = req.toolCallId ?? req.id
    if (toolCallId === undefined || session === undefined) {
      // Cannot correlate a resolution — fail closed rather than hang the turn.
      return { approved: false, reason: 'approval could not be routed' }
    }
    this.emitEvent(session.id, 'approval_request', { toolCallId, toolName: req.toolName })
    return await new Promise<ToolApprovalDecision>((resolve) => {
      this.pendingApprovals.set(toolCallId, { resolve, chatSessionId: session.id, toolName: req.toolName })
    })
  }

  /** Resolve a parked approval from an approve/deny route. Returns false if unknown. */
  resolveApproval (toolCallId: string, approved: boolean, reason?: string): boolean {
    const parked = this.pendingApprovals.get(toolCallId)
    if (parked === undefined) return false
    this.pendingApprovals.delete(toolCallId)
    
    let finalApproved = approved
    let finalReason = reason
    if (approved && isMutatingTool(parked.toolName)) {
      if (!this.ensureLock(parked.chatSessionId, parked.toolName)) {
        finalApproved = false
        finalReason = 'Another session holds the vault lock.'
      }
    }

    parked.resolve({ approved: finalApproved, ...(finalReason !== undefined ? { reason: finalReason } : {}) })
    this.emitEvent(parked.chatSessionId, 'approval_resolved', { toolCallId, approved: finalApproved })
    return true
  }

  /** Persist a chat event and fan it out to SSE clients. */
  private emitEvent (chatSessionId: string, type: string, payload: unknown): void {
    this.fanOut(chatSessionId, appendEvent(this.db, chatSessionId, type, payload))
  }

  /** Create a chat session and capture its provider config. Does not start the SDK yet. */
  create (input: { title: string, providerProfileId?: string | null, approvalPreset?: ApprovalPreset }): ChatSession {
    const snap = this.opts.snapshotFor(input.providerProfileId ?? null)
    if (snap === undefined) {
      throw new Error('no enabled provider profile available; configure one in Provider settings first')
    }
    const session = createSession(this.db, { title: input.title, providerProfileId: snap.profileId, approvalPreset: input.approvalPreset })
    appendEvent(this.db, session.id, 'session_config', capturedFromSnapshot(snap))
    return session
  }

  /** The config captured at create (non-secret), from the first session_config event. */
  private capturedConfig (chatSessionId: string): CapturedConfig {
    const event = readEventsSince(this.db, chatSessionId, 0).find(e => e.type === 'session_config')
    if (event === undefined) throw new Error(`chat session ${chatSessionId} has no captured config`)
    return event.payload as CapturedConfig
  }

  /** Build the SDK start config from the captured config plus the current key. */
  private startConfig (captured: CapturedConfig): AgentModelConfig & {
    cwd: string
    systemPrompt?: string
    enableTools: boolean
    enableSpawnAgent: boolean
    enableAgentTeams: boolean
  } {
    const snap = this.opts.snapshotFor(captured.providerProfileId)
    const model = toModelConfig({
      profileId: captured.providerProfileId,
      displayName: '',
      providerId: captured.providerId,
      modelId: captured.modelId,
      baseUrl: captured.baseUrl,
      headers: captured.headers,
      apiKey: snap?.apiKey ?? null,
    })
    return {
      ...model,
      cwd: this.opts.vaultCwd,
      ...(this.opts.systemPrompt !== undefined ? { systemPrompt: this.opts.systemPrompt } : { systemPrompt: 'You are working in the principal\'s second-brain vault.' }),
      // The SDK requires all three runtime feature flags (config.enableTools →
      // enable_tools, etc.). Sub-agents and teams are off for the MVP.
      enableTools: this.opts.enableTools ?? true,
      enableSpawnAgent: false,
      enableAgentTeams: false,
    }
  }

  /**
   * Ensure a live SDK session for this chat, starting or rehydrating as needed.
   * Returns the live SDK session id. `prompt` is passed to a fresh start only.
   */
  private async ensureLive (chatSessionId: string, prompt?: string): Promise<string> {
    const existing = this.live.get(chatSessionId)
    if (existing !== undefined) return existing

    const session = getSession(this.db, chatSessionId)
    if (session === undefined) throw new Error(`unknown chat session: ${chatSessionId}`)
    const config = this.startConfig(this.capturedConfig(chatSessionId))

    const approvalWiring = {
      capabilities: { requestToolApproval: (req: SdkApprovalRequest) => this.requestToolApproval(req) },
      toolPolicies: TOOL_POLICIES,
    }
    let sdkSessionId: string
    if (session.sdkSessionId !== null) {
      // Restart: rehydrate from the persisted SDK session's messages.
      let initialMessages = await this.runner.readMessages(session.sdkSessionId)
      if (session.compactionSummary !== null) {
        initialMessages = [{ role: 'user', content: `SYSTEM: Resuming session from compacted context:\n\n<compaction_summary>\n${session.compactionSummary}\n</compaction_summary>` }]
      }
      const result = await this.runner.start({ config, initialMessages, ...approvalWiring, ...(prompt !== undefined ? { prompt } : {}) })
      sdkSessionId = result.sessionId
    } else {
      const result = await this.runner.start({ config, ...approvalWiring, ...(prompt !== undefined ? { prompt } : {}) })
      sdkSessionId = result.sessionId
    }
    setSdkSessionId(this.db, chatSessionId, sdkSessionId)
    this.live.set(chatSessionId, sdkSessionId)

    const buffered = this.earlyEvents.get(sdkSessionId)
    if (buffered !== undefined) {
      this.earlyEvents.delete(sdkSessionId)
      for (const env of buffered) {
        this.handleSdkEvent(env)
      }
    }

    return sdkSessionId
  }

  /** Send a user message, starting or rehydrating the SDK session if needed. */
  async sendMessage (chatSessionId: string, text: string): Promise<{ sdkSessionId: string }> {
    appendEvent(this.db, chatSessionId, 'user_message', { text })
    const wasLive = this.live.has(chatSessionId)
    const sdkSessionId = await this.ensureLive(chatSessionId, wasLive ? undefined : text)
    if (wasLive) await this.runner.send(sdkSessionId, { type: 'user_message', text })
    return { sdkSessionId }
  }

  /** Instruct the agent to summarize context for manual compaction. */
  async compactSession (chatSessionId: string): Promise<{ sdkSessionId: string }> {
    const text = 'SYSTEM: Please generate a concise summary of the current working context, preserving task state, unfiled facts, pending approvals, and any other critical details. Start your response with `<compaction_summary>` and end it with `</compaction_summary>`.'
    appendEvent(this.db, chatSessionId, 'compaction_requested', null)
    try {
      const wasLive = this.live.has(chatSessionId)
      const sdkSessionId = await this.ensureLive(chatSessionId, wasLive ? undefined : text)
      if (wasLive) await this.runner.send(sdkSessionId, { type: 'user_message', text })
      return { sdkSessionId }
    } catch (err) {
      console.error('compactSession error:', err)
      throw err
    }
  }

  /**
   * Explicitly rehydrate a persisted session into a fresh live SDK session
   * (e.g. on server restart) without sending a message. Returns the new SDK
   * session id and how many messages were replayed.
   */
  async resume (chatSessionId: string): Promise<{ sdkSessionId: string, rehydratedMessages: number }> {
    const session = getSession(this.db, chatSessionId)
    if (session === undefined) throw new Error(`unknown chat session: ${chatSessionId}`)
    if (session.sdkSessionId === null) {
      throw new Error('session has never started; send a message to begin it')
    }
    let initialMessages = await this.runner.readMessages(session.sdkSessionId)
    if (session.compactionSummary !== null) {
      initialMessages = [{ role: 'user', content: `SYSTEM: Resuming session from compacted context:\n\n<compaction_summary>\n${session.compactionSummary}\n</compaction_summary>` }]
    }
    const config = this.startConfig(this.capturedConfig(chatSessionId))
    const result = await this.runner.start({
      config,
      initialMessages,
      capabilities: { requestToolApproval: (req: SdkApprovalRequest) => this.requestToolApproval(req) },
      toolPolicies: TOOL_POLICIES,
    })
    setSdkSessionId(this.db, chatSessionId, result.sessionId)
    this.live.set(chatSessionId, result.sessionId)
    return { sdkSessionId: result.sessionId, rehydratedMessages: initialMessages.length }
  }

  /** Whether this chat session is live in the current process. */
  isLive (chatSessionId: string): boolean {
    return this.live.has(chatSessionId)
  }
}
