import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ClineCore } from '@cline/core'
import { agentStorageEnv } from './runner.js'
import { applyWebToolsRegistration } from './web-tools-registration.js'
import { deployKeyPath, vaultWorkspacePath } from '../vault/config.js'
import { buildGitSshCommand } from '../vault/git.js'
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

/** Git environment inherited by SDK shell tools and their child processes. */
export function agentGitEnv (dataDir: string): NodeJS.ProcessEnv {
  return {
    GIT_SSH_COMMAND: buildGitSshCommand(deployKeyPath(dataDir)),
    GIT_TERMINAL_PROMPT: '0',
  }
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
      Object.assign(process.env, agentStorageEnv(this.dataDir), agentGitEnv(this.dataDir))
      // Move into the vault checkout so the claude-code subprocess inherits it
      // as its cwd (m39). Runs lazily on the first chat, by which point the
      // vault exists.
      enterVaultCwd(this.dataDir)
      // Register (or unregister) the web-tools MCP server before the SDK
      // reads its settings file on the first session start (m48). The file
      // lives under CLINE_DATA_DIR, which agentStorageEnv just pinned.
      applyWebToolsRegistration({
        settingsPath: path.join(this.dataDir, 'sessions', 'settings', 'cline_mcp_settings.json'),
        scriptPath: path.join(path.dirname(fileURLToPath(import.meta.url)), 'web-tools-mcp.js'),
        searxngUrl: process.env.SECOND_BRAIN_WEB_SEARXNG_URL,
      })
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
      ...(input.userImages !== undefined && input.userImages.length > 0 ? { userImages: input.userImages } : {}),
      ...(input.userFiles !== undefined && input.userFiles.length > 0 ? { userFiles: input.userFiles } : {}),
      ...(input.initialMessages !== undefined ? { initialMessages: input.initialMessages } : {}),
      ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}),
      ...(input.toolPolicies !== undefined ? { toolPolicies: input.toolPolicies } : {}),
      config: input.config,
    } as Parameters<ClineCore['start']>[0])
    return { sessionId: result.sessionId, messagesPath: result.messagesPath }
  }

  async send (sessionId: string, input: { type: string, text?: string, userImages?: string[], userFiles?: string[] }): Promise<void> {
    const core = await this.ensureCore()
    // The SDK's send (RuntimeHost.runTurn) takes a single input object keyed
    // by sessionId + prompt — not the (sessionId, {type, text}) pair our
    // AgentRunner interface exposes.
    await core.send({
      sessionId,
      prompt: input.text ?? '',
      ...(input.userImages !== undefined && input.userImages.length > 0 ? { userImages: input.userImages } : {}),
      ...(input.userFiles !== undefined && input.userFiles.length > 0 ? { userFiles: input.userFiles } : {}),
    } as unknown as Parameters<ClineCore['send']>[0])
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
