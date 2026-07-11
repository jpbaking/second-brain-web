import { existsSync } from 'node:fs'
import { ClineCore } from '@cline/core'
import { agentStorageEnv } from './runner.js'
import { vaultWorkspacePath } from '../vault/config.js'
import type { AgentRunner, AgentStartInput, AgentStartResult } from './runner.js'

/**
 * Move the process into the vault checkout. The `claude-code` provider runs the
 * Claude Code agent via `@anthropic-ai/claude-agent-sdk`, whose cwd defaults to
 * `process.cwd()` and which `@cline/core` does not override from the session
 * config (m39). Without this the agent's tools operate on the server's install
 * dir instead of the vault. No-op (returns false) when the vault does not exist
 * yet; safe because the server addresses everything else by absolute path
 * (data dir, `web/dist`).
 */
export function enterVaultCwd (dataDir: string): boolean {
  const vault = vaultWorkspacePath(dataDir)
  if (!existsSync(vault)) return false
  process.chdir(vault)
  return true
}

/**
 * Live {@link AgentRunner} backed by the Cline SDK (milestone 5A). This is the
 * one place that binds `@cline/core`; everything else in 5A depends on the
 * {@link AgentRunner} interface so it unit-tests with a fake. Not unit-tested
 * against a model — exercised live in the m5a-10 deliverable check.
 *
 * Session artifacts land under the app data root: {@link agentStorageEnv} sets
 * `CLINE_DATA_DIR` before the SDK reads it (default would be `~/.cline/data`).
 */
export class ClineAgentRunner implements AgentRunner {
  private core: ClineCore | undefined
  /** Listeners registered before the SDK core exists; attached on creation. */
  private readonly listeners = new Set<(event: unknown) => void>()

  constructor (private readonly dataDir: string, private readonly clientName = 'second-brain-web') {}

  private async ensureCore (): Promise<ClineCore> {
    if (this.core === undefined) {
      // Point SDK storage under our 0700 data root before it resolves paths.
      Object.assign(process.env, agentStorageEnv(this.dataDir))
      // Move into the vault checkout so the claude-code subprocess inherits it
      // as its cwd (m39). Runs lazily on the first chat, by which point the
      // vault exists.
      enterVaultCwd(this.dataDir)
      const core = await ClineCore.create({ clientName: this.clientName, backendMode: 'local' })
      // Attach any listeners registered before start() (e.g. the SSE bridge).
      for (const listener of this.listeners) core.subscribe(listener)
      this.core = core
    }
    return this.core
  }

  async start (input: AgentStartInput): Promise<AgentStartResult> {
    const core = await this.ensureCore()
    const result = await core.start({
      prompt: input.prompt,
      ...(input.initialMessages !== undefined ? { initialMessages: input.initialMessages } : {}),
      ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}),
      ...(input.toolPolicies !== undefined ? { toolPolicies: input.toolPolicies } : {}),
      config: input.config,
    } as Parameters<ClineCore['start']>[0])
    return { sessionId: result.sessionId, messagesPath: result.messagesPath }
  }

  async send (sessionId: string, input: { type: string, text?: string }): Promise<void> {
    const core = await this.ensureCore()
    await core.send(sessionId, input as Parameters<ClineCore['send']>[1])
  }

  subscribe (listener: (event: unknown) => void): () => void {
    this.listeners.add(listener)
    // Attach live if the core already exists; otherwise ensureCore() wires it.
    const live = this.core?.subscribe(listener)
    return () => {
      this.listeners.delete(listener)
      live?.()
    }
  }

  async readMessages (sessionId: string): Promise<unknown[]> {
    const core = await this.ensureCore()
    return await core.readMessages(sessionId) as unknown[]
  }

  async stop (sessionId: string): Promise<void> {
    if (this.core === undefined) return
    await this.core.stop(sessionId)
  }
}
