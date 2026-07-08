import { appendEvent, createSession, getSession, readEventsSince, setSdkSessionId } from './chat-store.js'
import { toModelConfig } from './runner.js'
import type { AgentRunner, AgentModelConfig } from './runner.js'
import type { ChatSession } from './chat-store.js'
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

  constructor (
    private readonly db: DatabaseSync,
    private readonly runner: AgentRunner,
    private readonly opts: AgentSessionOptions
  ) {}

  /** Create a chat session and capture its provider config. Does not start the SDK yet. */
  create (input: { title: string, providerProfileId?: string | null }): ChatSession {
    const snap = this.opts.snapshotFor(input.providerProfileId ?? null)
    if (snap === undefined) {
      throw new Error('no enabled provider profile available; configure one in Provider settings first')
    }
    const session = createSession(this.db, { title: input.title, providerProfileId: snap.profileId })
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
  private startConfig (captured: CapturedConfig): AgentModelConfig & { cwd: string, systemPrompt?: string, enableTools?: boolean } {
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
      ...(this.opts.systemPrompt !== undefined ? { systemPrompt: this.opts.systemPrompt } : {}),
      enableTools: this.opts.enableTools ?? true,
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

    let sdkSessionId: string
    if (session.sdkSessionId !== null) {
      // Restart: rehydrate from the persisted SDK session's messages.
      const initialMessages = await this.runner.readMessages(session.sdkSessionId)
      const result = await this.runner.start({ config, initialMessages, ...(prompt !== undefined ? { prompt } : {}) })
      sdkSessionId = result.sessionId
    } else {
      const result = await this.runner.start({ config, ...(prompt !== undefined ? { prompt } : {}) })
      sdkSessionId = result.sessionId
    }
    setSdkSessionId(this.db, chatSessionId, sdkSessionId)
    this.live.set(chatSessionId, sdkSessionId)
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
    const initialMessages = await this.runner.readMessages(session.sdkSessionId)
    const config = this.startConfig(this.capturedConfig(chatSessionId))
    const result = await this.runner.start({ config, initialMessages })
    setSdkSessionId(this.db, chatSessionId, result.sessionId)
    this.live.set(chatSessionId, result.sessionId)
    return { sdkSessionId: result.sessionId, rehydratedMessages: initialMessages.length }
  }

  /** Whether this chat session is live in the current process. */
  isLive (chatSessionId: string): boolean {
    return this.live.has(chatSessionId)
  }
}
