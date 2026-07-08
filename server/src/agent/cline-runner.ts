import { ClineCore } from '@cline/core'
import { agentStorageEnv } from './runner.js'
import type { AgentRunner, AgentStartInput, AgentStartResult } from './runner.js'

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

  constructor (private readonly dataDir: string, private readonly clientName = 'second-brain-web') {}

  private async ensureCore (): Promise<ClineCore> {
    if (this.core === undefined) {
      // Point SDK storage under our 0700 data root before it resolves paths.
      Object.assign(process.env, agentStorageEnv(this.dataDir))
      this.core = await ClineCore.create({ clientName: this.clientName, backendMode: 'local' })
    }
    return this.core
  }

  async start (input: AgentStartInput): Promise<AgentStartResult> {
    const core = await this.ensureCore()
    const result = await core.start({
      prompt: input.prompt,
      ...(input.initialMessages !== undefined ? { initialMessages: input.initialMessages } : {}),
      config: input.config,
    } as Parameters<ClineCore['start']>[0])
    return { sessionId: result.sessionId, messagesPath: result.messagesPath }
  }

  async send (sessionId: string, input: { type: string, text?: string }): Promise<void> {
    const core = await this.ensureCore()
    await core.send(sessionId, input as Parameters<ClineCore['send']>[1])
  }

  subscribe (listener: (event: unknown) => void): () => void {
    if (this.core === undefined) throw new Error('runner not started; call start() before subscribe()')
    return this.core.subscribe(listener)
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
