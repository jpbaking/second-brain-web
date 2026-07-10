import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import { translateSdkEvent } from '../src/agent/session.js'
import type { AgentRunner, AgentStartInput, AgentStartResult } from '../src/agent/runner.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

/** Fake runner with an emit() to simulate the SDK pushing subscribe events. */
class EmittingRunner implements AgentRunner {
  private listeners = new Set<(e: unknown) => void>()
  private n = 0
  async start (_input: AgentStartInput): Promise<AgentStartResult> {
    return { sessionId: `sdk-${++this.n}` }
  }

  async send (): Promise<void> {}
  subscribe (listener: (e: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async readMessages (): Promise<unknown[]> { return [] }
  async stop (): Promise<void> {}
  emit (event: unknown): void { for (const l of this.listeners) l(event) }
}

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  const c = list.find(x => x.startsWith(`${name}=`))
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

async function liveApp (): Promise<{ base: string, cookie: string, runner: EmittingRunner, app: FastifyInstance }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-sse-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'k' })
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state)
  const runner = new EmittingRunner()
  const app = buildApp(config, { agentRunner: runner })
  apps.push(app)
  await app.listen({ port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`

  const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({
    method: 'POST',
    url: '/api/auth/totp',
    headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` },
    payload: { code },
  })
  return { base, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`, runner, app }
}

/** A single-reader SSE consumer: `until()` accumulates frames across calls. */
function sseReader (res: Response): { until: (p: (buf: string) => boolean, ms?: number) => Promise<string>, close: () => Promise<void> } {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  let buf = ''
  return {
    async until (predicate, ms = 3000) {
      const deadline = Date.now() + ms
      while (!predicate(buf) && Date.now() < deadline) {
        const chunk = await Promise.race([
          reader.read(),
          new Promise<{ value: undefined, done: true }>(resolve => setTimeout(() => resolve({ value: undefined, done: true }), 250)),
        ])
        if (chunk.value !== undefined) buf += decoder.decode(chunk.value, { stream: true })
      }
      return buf
    },
    async close () { await reader.cancel().catch(() => {}) },
  }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('translateSdkEvent', () => {
  it('maps SDK envelopes to chat event types (and ignores unknowns)', () => {
    expect(translateSdkEvent({ type: 'chunk', payload: { text: 'hi' } })).toEqual({ type: 'chunk', payload: { text: 'hi' } })
    expect(translateSdkEvent({ type: 'agent_event', payload: { event: { type: 'text', text: 'hello' } } }))
      .toEqual({ type: 'agent_event', payload: { type: 'text', text: 'hello' } })
    expect(translateSdkEvent({ type: 'ended' })).toEqual({ type: 'ended', payload: null })
    expect(translateSdkEvent({ type: 'mystery' })).toBeNull()
  })
})

describe('chat SSE stream', () => {
  it('replays persisted events then delivers a live event', async () => {
    const { base, cookie, runner } = await liveApp()
    // Seed a default profile + a started session (creates session_config + user_message events).
    await fetch(`${base}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'L', providerId: 'openai-compatible', modelId: 'm', baseUrl: 'http://127.0.0.1:1234/v1', isDefault: true }),
    })
    const created = await (await fetch(`${base}/api/chat/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: 'C' }),
    })).json() as { id: string }
    await fetch(`${base}/api/chat/sessions/${created.id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ text: 'hi' }),
    })

    const res = await fetch(`${base}/api/chat/sessions/${created.id}/events`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const sse = sseReader(res)

    // Replay should include the persisted session_config and user_message events.
    const replayed = await sse.until(buf => buf.includes('user_message'))
    expect(replayed).toContain('session_config')
    expect(replayed).toContain('user_message')

    // A live SDK event for sdk-1 (the started session) should stream through.
    runner.emit({ type: 'chunk', sessionId: 'sdk-1', payload: { text: 'streamed' } })
    const live = await sse.until(buf => buf.includes('streamed'))
    expect(live).toContain('event: chunk')
    expect(live).toContain('streamed')
    await sse.close()
  })

  it('replays only newer events when reconnecting with Last-Event-ID', async () => {
    const { base, cookie } = await liveApp()
    await fetch(`${base}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'L', providerId: 'openai-compatible', modelId: 'm', baseUrl: 'http://127.0.0.1:1234/v1', isDefault: true }),
    })
    const created = await (await fetch(`${base}/api/chat/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: 'C' }),
    })).json() as { id: string }
    await fetch(`${base}/api/chat/sessions/${created.id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ text: 'hi' }),
    })
    // seq 1 = session_config, seq 2 = user_message. Reconnect after seq 1.
    const res = await fetch(`${base}/api/chat/sessions/${created.id}/events`, { headers: { cookie, 'last-event-id': '1' } })
    const sse = sseReader(res)
    const buf = await sse.until(b => b.includes('user_message'))
    expect(buf).toContain('user_message')
    expect(buf).not.toContain('session_config')
    await sse.close()
  })
})
