import { createHandlerAsync, registerAsyncHandler } from '@cline/llms'
import type { ProviderConfig } from '@cline/llms'

/**
 * Pin the embedded Claude Code CLI to inference only (repair, 2026-07-13).
 *
 * The SDK's `claude-code` provider ignores Cline's AI SDK tools ("tools is
 * not supported" warning) and — on the current @cline/core — our
 * `claudeCode: { tools: [] }` model config is silently dropped, so the CLI
 * brings up its OWN tools. Those tool calls bypass Cline's approval resolver
 * and the vault write guard entirely (a hard-rule violation); in practice
 * they fail on the CLI's default permissions, and each failure makes the
 * runtime start another iteration — chats on claude-code profiles never
 * finish.
 *
 * @cline/core builds gateway models through a per-provider option whitelist
 * with no claude-code branch, but it prefers a *registered* llms handler
 * when one exists. This registers a claude-code handler that re-enters the
 * builtin implementation via `routingProviderId` (avoiding registry
 * recursion) with the CLI's tools and filesystem settings pinned off. The
 * model then answers in text and turns end after one iteration.
 *
 * Remove once the Cline SDK bridges its tools to the CLI (see BACKLOG).
 */

let registered = false

/** The config transform applied by the registered handler (exported for tests). */
export function pinnedClaudeCodeConfig<T extends { claudeCode?: unknown }> (config: T): T & {
  providerId: string
  routingProviderId: string
  claudeCode: { defaultSettings: { tools: string[], settingSources: string[] } }
} {
  return {
    ...config,
    // A non-registered id that routes to the builtin claude-code handler;
    // re-using "claude-code" would re-enter this registered handler forever.
    providerId: 'sbw-claude-code-inference',
    routingProviderId: 'claude-code',
    claudeCode: { defaultSettings: { tools: [], settingSources: [] } },
  }
}

/** Idempotently register the inference-only claude-code handler. */
export function registerClaudeCodeInferencePin (): void {
  if (registered) return
  registered = true
  registerAsyncHandler('claude-code', async (config: ProviderConfig) => await createHandlerAsync(pinnedClaudeCodeConfig(config)))
}
