import { describe, expect, it } from 'vitest'
import { createClineSdkLogger, createTracedProviderFetch } from '../src/agent/cline-logging.js'
import { getAppLogger } from '../src/logging.js'

function capturedLogger (category: string): { lines: string[], logger: ReturnType<typeof getAppLogger> } {
  const lines: string[] = []
  return { lines, logger: getAppLogger(category, { write: line => lines.push(line) }) }
}

function records (lines: string[]): Array<Record<string, unknown>> {
  return lines.map(line => JSON.parse(line) as Record<string, unknown>)
}

describe('Cline SDK log4js bridge', () => {
  it('maps SDK levels and allow-lists metadata', () => {
    const capture = capturedLogger('cline.sdk.test')
    const logger = createClineSdkLogger(capture.logger)

    logger.debug('runtime selected', {
      sessionId: 'session-one',
      providerId: 'anthropic',
      durationMs: 12,
      apiKey: 'secret-key',
      prompt: 'private prompt',
    })
    logger.log('cleanup delayed', { severity: 'warn', stage: 'shutdown' })
    logger.error?.('provider failed', { error: new Error('secret-bearing detail'), requestId: 'req-one' })

    const output = records(capture.lines)
    expect(output.map(record => record.level)).toEqual(['debug', 'warn', 'error'])
    expect(output[0]).toMatchObject({ sessionId: 'session-one', providerId: 'anthropic', durationMs: 12 })
    expect(output[2]).toMatchObject({ requestId: 'req-one', errorName: 'Error' })
    expect(capture.lines.join('\n')).not.toContain('secret-key')
    expect(capture.lines.join('\n')).not.toContain('private prompt')
    expect(capture.lines.join('\n')).not.toContain('secret-bearing detail')
  })
})

describe('provider fetch tracing', () => {
  it('logs sanitized trace request/response summaries', async () => {
    const capture = capturedLogger('cline.provider.test')
    const baseFetch: typeof fetch = async () => new Response('{"private":"response"}', {
      status: 201,
      headers: { 'x-request-id': 'provider-request-one' },
    })
    const tracedFetch = createTracedProviderFetch(baseFetch, capture.logger)

    const response = await tracedFetch('https://api.example.test/v1/messages?key=query-secret', {
      method: 'POST',
      headers: { authorization: 'Bearer header-secret' },
      body: '{"prompt":"body-secret"}',
    })

    expect(response.status).toBe(201)
    const output = records(capture.lines)
    expect(output).toHaveLength(2)
    expect(output[0]).toMatchObject({
      level: 'trace',
      msg: 'provider request started',
      method: 'POST',
      host: 'api.example.test',
      path: '/v1/messages',
    })
    expect(output[1]).toMatchObject({
      level: 'trace',
      msg: 'provider response received',
      status: 201,
      requestId: 'provider-request-one',
    })
    expect(typeof output[1]?.durationMs).toBe('number')
    const all = capture.lines.join('\n')
    expect(all).not.toContain('query-secret')
    expect(all).not.toContain('header-secret')
    expect(all).not.toContain('body-secret')
    expect(all).not.toContain('private')
  })

  it('logs a safe failure summary and rethrows the original fetch cause', async () => {
    const capture = capturedLogger('cline.provider.test')
    const cause = new TypeError('request failed for https://host/path?key=secret')
    const tracedFetch = createTracedProviderFetch(async () => { throw cause }, capture.logger)

    let thrown: unknown
    try { await tracedFetch('https://safe.example/v1/models?token=hidden') } catch (error) { thrown = error }

    expect(thrown).toBe(cause)
    expect(records(capture.lines).at(-1)).toMatchObject({
      level: 'trace',
      msg: 'provider request failed',
      host: 'safe.example',
      path: '/v1/models',
      errorName: 'TypeError',
    })
    expect(capture.lines.join('\n')).not.toContain('secret')
    expect(capture.lines.join('\n')).not.toContain('hidden')
  })
})
