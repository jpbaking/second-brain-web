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
import type { AgentRunner, AgentStartInput, AgentStartResult } from '../src/agent/runner.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

class FakeRunner implements AgentRunner {
  starts: AgentStartInput[] = []
  sends: Array<{ sessionId: string, text?: string }> = []
  private n = 0
  async start (input: AgentStartInput): Promise<AgentStartResult> {
    this.starts.push(input)
    return { sessionId: `sdk-${++this.n}` }
  }

  async send (sessionId: string, input: { type: string, text?: string }): Promise<void> {
    this.sends.push({ sessionId, text: input.text })
  }

  subscribe (): () => void { return () => {} }
  async readMessages (): Promise<unknown[]> { return [] }
  async stop (): Promise<void> {}
}

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  const c = list.find(x => x.startsWith(`${name}=`))
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

async function authedApp (): Promise<{ app: FastifyInstance, cookie: string, runner: FakeRunner }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-chatapi-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'k' })
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state)
  const runner = new FakeRunner()
  const app = buildApp(config, { agentRunner: runner })
  apps.push(app)

  const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({
    method: 'POST',
    url: '/api/auth/totp',
    headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` },
    payload: { code },
  })
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`, runner }
}

/** Create an enabled default provider profile so session creation resolves a snapshot. */
async function seedDefaultProfile (app: FastifyInstance, cookie: string): Promise<void> {
  await app.inject({
    method: 'POST',
    url: '/api/providers',
    headers: { cookie },
    payload: { displayName: 'Local', providerId: 'openai-compatible', modelId: 'local-model', baseUrl: 'http://127.0.0.1:1234/v1', isDefault: true },
  })
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('chat API', () => {
  it('requires authentication', async () => {
    const { app } = await authedApp()
    expect((await app.inject({ method: 'GET', url: '/api/chat/sessions' })).statusCode).toBe(401)
  })

  it('refuses to create a session with no provider profile configured', async () => {
    const { app, cookie } = await authedApp()
    const res = await app.inject({ method: 'POST', url: '/api/chat/sessions', headers: { cookie }, payload: { title: 'X' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/provider profile/)
  })

  it('creates, lists, gets, renames, and closes a session', async () => {
    const { app, cookie } = await authedApp()
    await seedDefaultProfile(app, cookie)

    const created = await app.inject({ method: 'POST', url: '/api/chat/sessions', headers: { cookie }, payload: { title: 'First' } })
    expect(created.statusCode).toBe(201)
    const id = created.json().id

    const list = await app.inject({ method: 'GET', url: '/api/chat/sessions', headers: { cookie } })
    expect(list.json().sessions).toHaveLength(1)

    const got = await app.inject({ method: 'GET', url: `/api/chat/sessions/${id}`, headers: { cookie } })
    expect(got.json().session.title).toBe('First')
    // The captured session_config event is present but never contains a key field.
    expect(got.body).not.toContain('apiKey')

    const renamed = await app.inject({ method: 'PATCH', url: `/api/chat/sessions/${id}`, headers: { cookie }, payload: { title: 'Renamed' } })
    expect(renamed.json().title).toBe('Renamed')

    const closed = await app.inject({ method: 'DELETE', url: `/api/chat/sessions/${id}`, headers: { cookie } })
    expect(closed.statusCode).toBe(200)
  })

  it('posts a message which starts the SDK session via the runner', async () => {
    const { app, cookie, runner } = await authedApp()
    await seedDefaultProfile(app, cookie)
    const id = (await app.inject({ method: 'POST', url: '/api/chat/sessions', headers: { cookie }, payload: { title: 'C' } })).json().id

    const sent = await app.inject({ method: 'POST', url: `/api/chat/sessions/${id}/messages`, headers: { cookie }, payload: { text: 'hello' } })
    expect(sent.statusCode).toBe(202)
    expect(sent.json().sdkSessionId).toBe('sdk-1')
    expect(runner.starts).toHaveLength(1)
    expect(runner.starts[0]?.prompt).toBe('hello')
  })

  it('accepts a bodyless compaction POST (no empty-body 400)', async () => {
    const { app, cookie } = await authedApp()
    await seedDefaultProfile(app, cookie)
    const id = (await app.inject({ method: 'POST', url: '/api/chat/sessions', headers: { cookie }, payload: { title: 'C' } })).json().id
    // No content-type, no body — must not 400 (the m05-07 lesson).
    const res = await app.inject({ method: 'POST', url: `/api/chat/sessions/${id}/compact`, headers: { cookie } })
    expect(res.statusCode).toBe(202)
  })

  it('404s messages/commands for an unknown session', async () => {
    const { app, cookie } = await authedApp()
    const msg = await app.inject({ method: 'POST', url: '/api/chat/sessions/ghost/messages', headers: { cookie }, payload: { text: 'x' } })
    expect(msg.statusCode).toBe(404)
    const cmd = await app.inject({ method: 'POST', url: '/api/chat/sessions/ghost/commands', headers: { cookie }, payload: { command: 'y' } })
    expect(cmd.statusCode).toBe(404)
  })
})
