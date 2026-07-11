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
import { seedDefaultProvider } from './helpers/seed-provider.js'

const scratch: string[] = []
const apps: FastifyInstance[] = []

class FakeRunner implements AgentRunner {
  starts: AgentStartInput[] = []
  private n = 0
  async start (input: AgentStartInput): Promise<AgentStartResult> {
    this.starts.push(input)
    return { sessionId: `sdk-${++this.n}` }
  }

  async send (): Promise<void> {}
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
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-capture-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'k' })
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
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
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`, runner, dataDir: config.dataDir }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('quick capture', () => {
  it('requires authentication', async () => {
    const { app } = await authedApp()
    const res = await app.inject({ method: 'POST', url: '/api/capture', payload: { content: 'hi' } })
    expect(res.statusCode).toBe(401)
  })

  it('rejects empty content', async () => {
    const { app, cookie, dataDir } = await authedApp()
    seedDefaultProvider(dataDir)
    const res = await app.inject({ method: 'POST', url: '/api/capture', headers: { cookie }, payload: { content: '   ' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/content/i)
  })

  it('refuses when no provider profile is configured', async () => {
    const { app, cookie } = await authedApp()
    const res = await app.inject({ method: 'POST', url: '/api/capture', headers: { cookie }, payload: { content: 'buy milk' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/provider profile/)
  })

  it('routes the note through the agent and creates a filing session', async () => {
    const { app, cookie, runner, dataDir } = await authedApp()
    seedDefaultProvider(dataDir)

    const note = 'Remember: call the dentist on Friday about the crown.'
    const res = await app.inject({ method: 'POST', url: '/api/capture', headers: { cookie }, payload: { content: note } })
    expect(res.statusCode).toBe(201)
    expect(res.json().ok).toBe(true)
    expect(typeof res.json().sessionId).toBe('string')

    // Dispatched to the agent with a filing instruction carrying the note verbatim.
    expect(runner.starts).toHaveLength(1)
    const prompt = runner.starts[0]?.prompt ?? ''
    expect(prompt).toContain(note)
    expect(prompt).toMatch(/memory\//)

    // A chat session was created (titled from the note) and is inspectable.
    const list = await app.inject({ method: 'GET', url: '/api/chat/sessions', headers: { cookie } })
    expect(list.json().sessions).toHaveLength(1)
    expect(list.json().sessions[0].title).toMatch(/^Capture:/)

    // The captured content is never lost — the user_message event holds it.
    const id = res.json().sessionId
    const detail = await app.inject({ method: 'GET', url: `/api/chat/sessions/${id}`, headers: { cookie } })
    expect(JSON.stringify(detail.json().events)).toContain(note)
  })
})
