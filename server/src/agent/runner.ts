import path from 'node:path'
import type { ProviderSnapshot } from '../providers/snapshot.js'

/**
 * Agent runner (phase-004 Cline SDK Chat, milestone 5A). Maps a m05 provider
 * snapshot to the SDK's model config and points the SDK's storage under the
 * app data root. The live SDK sits behind {@link AgentRunner} so the rest of
 * 5A unit-tests with a fake runner and no model. Provider keys flow through the
 * config in memory only — never logged, never returned to the browser.
 */

/** SDK-shaped model config (a subset of the SDK's CoreModelConfig). */
export interface AgentModelConfig {
  providerId: string
  modelId: string
  apiKey?: string
  baseUrl?: string
  headers?: Record<string, string>
}

/**
 * Map a m05 provider id to the SDK provider id.
 * - `anthropic`         → `anthropic`      (official Anthropic API)
 * - `openai`            → `openai-native`  (official OpenAI API)
 * - `openai-compatible` → `openai-compatible` (LM Studio and other gateways)
 * Pending live confirmation in m5a-10.
 */
const PROVIDER_ID_MAP: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai-native',
  'openai-compatible': 'openai-compatible',
}

export function sdkProviderId (providerId: string): string {
  const mapped = PROVIDER_ID_MAP[providerId]
  if (mapped === undefined) throw new Error(`unsupported provider id: ${providerId}`)
  return mapped
}

/** Trim trailing slashes; append `/v1` when the URL carries no path segment. */
export function normaliseOpenAiBaseUrl (baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  let pathname: string
  try {
    pathname = new URL(trimmed).pathname
  } catch {
    return trimmed
  }
  // A bare host (path "/" or empty) needs the /v1 suffix — the spike found LM
  // Studio returns an empty response without it (findings m00-08).
  return pathname === '' || pathname === '/' ? `${trimmed}/v1` : trimmed
}

/** Build the SDK model config from a captured provider snapshot. */
export function toModelConfig (snapshot: ProviderSnapshot): AgentModelConfig {
  const config: AgentModelConfig = {
    providerId: sdkProviderId(snapshot.providerId),
    modelId: snapshot.modelId,
  }
  if (snapshot.apiKey !== null) config.apiKey = snapshot.apiKey
  if (snapshot.baseUrl !== null) {
    config.baseUrl = snapshot.providerId === 'openai-compatible'
      ? normaliseOpenAiBaseUrl(snapshot.baseUrl)
      : snapshot.baseUrl.replace(/\/+$/, '')
  }
  if (snapshot.headers !== null) config.headers = snapshot.headers
  return config
}

/**
 * Environment overrides that keep SDK session artifacts under the app's 0700
 * data root (default is `~/.cline/data`). Set these before constructing the
 * SDK. `sessions/` already exists in the data layout (config.ts DATA_SUBDIRS).
 */
export function agentStorageEnv (dataDir: string): { CLINE_DATA_DIR: string } {
  return { CLINE_DATA_DIR: path.join(dataDir, 'sessions') }
}

/**
 * The minimal live-agent surface 5A needs, behind an interface so backend,
 * routes, SSE, and approvals unit-test against a fake. Shapes mirror the SDK
 * (`ClineCore.start`/`send`/`subscribe`/`readMessages`/`stop`) loosely so the
 * adapter stays thin; exact SDK types are bound in the adapter, not here.
 */
/** A tool-approval request from the SDK (spike m00-06). `toolCallId` correlates. */
export interface SdkApprovalRequest {
  sessionId?: string
  toolCallId?: string
  id?: string
  toolName: string
  input?: Record<string, unknown> | null
}

export interface ToolApprovalDecision {
  approved: boolean
  reason?: string
}

export interface AgentCapabilities {
  requestToolApproval: (req: SdkApprovalRequest) => Promise<ToolApprovalDecision>
}

export interface AgentStartInput {
  config: AgentModelConfig & { systemPrompt?: string, cwd?: string, enableTools?: boolean }
  prompt?: string
  initialMessages?: unknown[]
  /** Approval + policy wiring; resolvers must be installed before start (m00-06). */
  capabilities?: AgentCapabilities
  toolPolicies?: unknown
}

export interface AgentStartResult {
  sessionId: string
  messagesPath?: string
}

export interface AgentRunner {
  start: (input: AgentStartInput) => Promise<AgentStartResult>
  send: (sessionId: string, input: { type: string, text?: string }) => Promise<void>
  subscribe: (listener: (event: unknown) => void) => () => void
  readMessages: (sessionId: string) => Promise<unknown[]>
  stop: (sessionId: string) => Promise<void>
}
