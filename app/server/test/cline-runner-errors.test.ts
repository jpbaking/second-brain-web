import { describe, expect, it } from 'vitest'
import { AgentRunnerError } from '../src/agent/runner.js'
import { ClineAgentRunner, ClineAgentRunnerError, type ClineAgentRunnerDeps } from '../src/agent/cline-runner.js'

type Core = Awaited<ReturnType<ClineAgentRunnerDeps['createCore']>>

function fakeCore (overrides: Partial<Core> = {}): Core {
  return {
    start: async () => ({ sessionId: 'sdk-one' }),
    send: async () => {},
    subscribe: () => () => {},
    readMessages: async () => [],
    stop: async () => {},
    ...overrides,
  } as Core
}

function runnerWith (core: Core): ClineAgentRunner {
  return new ClineAgentRunner('/tmp/sbw-cline-errors', 'test', {
    createCore: async () => core,
    enterVaultCwd: () => false,
    applyWebToolsRegistration: () => {},
  })
}

function expectClineError (error: unknown, operation: string, cause: string, stage?: string): void {
  expect(error).toBeInstanceOf(ClineAgentRunnerError)
  expect(error).toBeInstanceOf(AgentRunnerError)
  const typed = error as InstanceType<typeof ClineAgentRunnerError>
  expect(typed.data).toMatchObject({ code: 'CLINE_AGENT_RUNNER_ERROR', operation, ...(stage === undefined ? {} : { stage }) })
  expect(typed.stack).toContain(`Caused by: Error: ${cause}`)
}

describe('ClineAgentRunner exception boundary', () => {
  it('identifies SDK creation as an initialisation-stage failure', async () => {
    const runner = new ClineAgentRunner('/tmp/sbw-cline-errors', 'test', {
      createCore: async () => { throw new Error('SDK unavailable') },
      enterVaultCwd: () => false,
      applyWebToolsRegistration: () => {},
    })

    let thrown: unknown
    try { await runner.start({ config: { providerId: 'anthropic', modelId: 'model' } }) } catch (error) { thrown = error }
    expectClineError(thrown, 'initialise', 'SDK unavailable', 'sdk-create')
  })

  it('wraps start and send failures without including message content', async () => {
    const core = fakeCore({
      start: async () => { throw new Error('start exploded') },
      send: async () => { throw new Error('send exploded') },
    })
    const runner = runnerWith(core)

    let startError: unknown
    try { await runner.start({ config: { providerId: 'anthropic', modelId: 'model' }, prompt: 'private prompt' }) } catch (error) { startError = error }
    expectClineError(startError, 'start', 'start exploded')
    expect(JSON.stringify((startError as InstanceType<typeof ClineAgentRunnerError>).data)).not.toContain('private prompt')

    let sendError: unknown
    try { await runner.send('session-one', { type: 'user_message', text: 'private message' }) } catch (error) { sendError = error }
    expectClineError(sendError, 'send', 'send exploded')
    expect((sendError as InstanceType<typeof ClineAgentRunnerError>).data?.sessionId).toBe('session-one')
  })

  it('wraps read and stop failures with the safe session id', async () => {
    const runner = runnerWith(fakeCore({
      readMessages: async () => { throw new Error('read exploded') },
      stop: async () => { throw new Error('stop exploded') },
    }))

    let readError: unknown
    try { await runner.readMessages('session-two') } catch (error) { readError = error }
    expectClineError(readError, 'read-messages', 'read exploded')

    let stopError: unknown
    try { await runner.stop('session-two') } catch (error) { stopError = error }
    expectClineError(stopError, 'stop', 'stop exploded')
  })

  it('wraps live subscribe and unsubscribe failures synchronously', async () => {
    let failUnsubscribe = false
    const runner = runnerWith(fakeCore({
      subscribe: () => {
        if (!failUnsubscribe) return () => { failUnsubscribe = true; throw new Error('unsubscribe exploded') }
        throw new Error('subscribe exploded')
      },
    }))
    await runner.start({ config: { providerId: 'anthropic', modelId: 'model' } })

    const unsubscribe = runner.subscribe(() => {})
    let unsubscribeError: unknown
    try { unsubscribe() } catch (error) { unsubscribeError = error }
    expectClineError(unsubscribeError, 'unsubscribe', 'unsubscribe exploded')

    let subscribeError: unknown
    try { runner.subscribe(() => {}) } catch (error) { subscribeError = error }
    expectClineError(subscribeError, 'subscribe', 'subscribe exploded')
  })
})
