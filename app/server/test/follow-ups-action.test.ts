import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import { vaultWorkspacePath } from '../src/vault/config.js'
import type { AgentRunner, AgentStartInput, AgentStartResult } from '../src/agent/runner.js'
import type { FollowUpItem } from '../src/follow-ups/parse.js'
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
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-follow-action-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'k' })
  prepareDatabases(config.dataDir)
  const notes = path.join(vaultWorkspacePath(config.dataDir), 'memory', 'notes')
  mkdirSync(notes, { recursive: true })
  writeFileSync(path.join(notes, 'reminders.md'), '## Open\n- [ ] 2026-07-15 due: Renew the domain\n')
  writeFileSync(path.join(notes, 'commitments.md'), '## I owe\n- [ ] 2026-07-11 due: Send the reply\n')
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
  const runner = new FakeRunner()
  const app = buildApp(config, { agentRunner: runner })
  apps.push(app)

  const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({ method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code } })
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`, runner, dataDir: config.dataDir }
}

async function itemByText (app: FastifyInstance, cookie: string, needle: string): Promise<FollowUpItem> {
  const res = await app.inject({ method: 'GET', url: '/api/follow-ups?filter=active', headers: { cookie } })
  const item = (res.json().items as FollowUpItem[]).find(i => i.text.startsWith(needle))
  if (item === undefined) throw new Error(`no seeded follow-up matching ${needle}`)
  return item
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('follow-up actions', () => {
  it('requires authentication', async () => {
    const { app } = await authedApp()
    const res = await app.inject({ method: 'POST', url: '/api/follow-ups/abc/complete' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 for an unknown follow-up id', async () => {
    const { app, cookie, dataDir } = await authedApp()
    seedDefaultProvider(dataDir)
    const res = await app.inject({ method: 'POST', url: '/api/follow-ups/deadbeef/complete', headers: { cookie } })
    expect(res.statusCode).toBe(404)
  })

  it('refuses when no provider profile is configured', async () => {
    const { app, cookie } = await authedApp()
    const item = await itemByText(app, cookie, 'Renew the domain')
    const res = await app.inject({ method: 'POST', url: `/api/follow-ups/${item.id}/complete`, headers: { cookie } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/provider profile/)
  })

  it('routes completion through the agent instead of writing the vault directly', async () => {
    const { app, cookie, runner, dataDir } = await authedApp()
    seedDefaultProvider(dataDir)
    const item = await itemByText(app, cookie, 'Renew the domain')

    const res = await app.inject({ method: 'POST', url: `/api/follow-ups/${item.id}/complete`, headers: { cookie } })
    expect(res.statusCode).toBe(201)
    expect(res.json().ok).toBe(true)

    // Dispatched to the agent, pointed at the exact source file/line, asked to complete it.
    expect(runner.starts).toHaveLength(1)
    const prompt = runner.starts[0]?.prompt ?? ''
    expect(prompt).toContain('Renew the domain')
    expect(prompt).toContain(item.sourceFile)
    expect(prompt).toMatch(/complete/i)

    // A high-trust filing session was created and is inspectable.
    const list = await app.inject({ method: 'GET', url: '/api/chat/sessions', headers: { cookie } })
    expect(list.json().sessions).toHaveLength(1)
    expect(list.json().sessions[0].title).toMatch(/^Complete:/)
  })

  it('routes an edit through the agent with the new text', async () => {
    const { app, cookie, runner, dataDir } = await authedApp()
    seedDefaultProvider(dataDir)
    const item = await itemByText(app, cookie, 'Send the reply')

    const empty = await app.inject({ method: 'POST', url: `/api/follow-ups/${item.id}/edit`, headers: { cookie }, payload: { text: '   ' } })
    expect(empty.statusCode).toBe(400)

    const res = await app.inject({ method: 'POST', url: `/api/follow-ups/${item.id}/edit`, headers: { cookie }, payload: { text: 'Send the signed reply' } })
    expect(res.statusCode).toBe(201)
    const prompt = runner.starts[0]?.prompt ?? ''
    expect(prompt).toContain('Send the signed reply')
    expect(prompt).toContain(item.sourceFile)
  })
})
