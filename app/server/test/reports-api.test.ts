import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
import { openCoreDb } from '../src/db.js'
import { createSession } from '../src/agent/chat-store.js'
import { saveReportProvenance } from '../src/reports/store.js'
import { createProfile } from '../src/providers/store.js'
import type { FastifyInstance } from 'fastify'
import type { AgentRunner } from '../src/agent/runner.js'

class FakeRunner implements AgentRunner {
  async start () { return { sessionId: 'sdk-1' } }
  async send () {}
  subscribe () { return () => {} }
  async readMessages () { return [] }
  async stop () {}
}

const scratch: string[] = []
const apps: FastifyInstance[] = []

function cookieValue (header: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header]
  return values.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0]
}

async function fixture (): Promise<{ app: FastifyInstance, cookie: string, workspace: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-report-api-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'test-owner-key' })
  prepareDatabases(config.dataDir)
  const workspace = vaultWorkspacePath(config.dataDir)
  const reportDir = path.join(workspace, 'reports', '2026')
  mkdirSync(reportDir, { recursive: true })
  writeFileSync(path.join(reportDir, 'brief.html'), '<title>Private brief</title><h1>Secret</h1>')
  writeFileSync(path.join(reportDir, 'notes.md'), '# Private notes\n')
  writeFileSync(path.join(reportDir, 'data.txt'), 'unsupported')
  const outside = path.join(workspace, 'outside.pdf')
  writeFileSync(outside, 'outside')
  symlinkSync(outside, path.join(reportDir, 'escape.pdf'))

  const coreDb = openCoreDb(config.dataDir)
  const session = createSession(coreDb, { title: 'Test' })
  const pId = createProfile(coreDb, { displayName: 'Test Profile', providerId: 'openai', modelId: 'gpt-4' })
  saveReportProvenance(coreDb, {
    reportPath: '2026/brief.html',
    sessionId: session.id,
    prompt: 'make brief',
    providerProfileId: pId,
    vaultCommit: '123commit'
  })
  coreDb.close()

  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
  const app = buildApp(config, { agentRunner: new FakeRunner() })
  apps.push(app)
  const passwordResponse = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(passwordResponse.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({
    method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code },
  })
  return { app, workspace, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}` }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('report API', () => {
  it('requires authentication for listing and content', async () => {
    const { app } = await fixture()
    expect((await app.inject({ method: 'GET', url: '/api/reports' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/reports/content/2026/brief.html' })).statusCode).toBe(401)
  })

  it('lists metadata and serves supported report content', async () => {
    const { app, cookie } = await fixture()
    const list = await app.inject({ method: 'GET', url: '/api/reports', headers: { cookie } })
    expect(list.statusCode).toBe(200)
    expect(list.json().reports.map((report: { path: string }) => report.path).sort()).toEqual(['2026/brief.html', '2026/notes.md'])

    const brief = list.json().reports.find((r: any) => r.path === '2026/brief.html')
    expect(brief.provenance).toBeDefined()
    expect(brief.provenance.sessionId).toBeDefined()
    expect(brief.provenance.prompt).toBe('make brief')
    expect(typeof brief.provenance.providerProfileId).toBe('string')
    expect(brief.provenance.vaultCommit).toBe('123commit')

    const notes = list.json().reports.find((r: any) => r.path === '2026/notes.md')
    expect(notes.provenance).toBeUndefined()

    const html = await app.inject({ method: 'GET', url: '/api/reports/content/2026/brief.html', headers: { cookie } })
    expect(html.statusCode).toBe(200)
    expect(html.headers['content-type']).toMatch(/^text\/html/)
    expect(html.body).toContain('Private brief')
    expect(html.headers['x-content-type-options']).toBe('nosniff')
    expect(html.headers['content-disposition']).toBeUndefined()

    const markdown = await app.inject({ method: 'GET', url: '/api/reports/content/2026/notes.md', headers: { cookie } })
    expect(markdown.statusCode).toBe(200)
    expect(markdown.headers['content-type']).toMatch(/^text\/markdown/)
    expect(markdown.headers['content-disposition']).toBe('attachment; filename="notes.md"')
  })

  it('rejects traversal, symlink escapes, directories, missing files, and unsupported types', async () => {
    const { app, cookie } = await fixture()
    const get = async (url: string) => await app.inject({ method: 'GET', url, headers: { cookie } })
    expect([400, 404]).toContain((await get('/api/reports/content/%2e%2e/outside.pdf')).statusCode)
    expect((await get('/api/reports/content/2026/escape.pdf')).statusCode).toBe(400)
    expect((await get('/api/reports/content/2026')).statusCode).toBe(404)
    expect((await get('/api/reports/content/2026/missing.pdf')).statusCode).toBe(404)
    expect((await get('/api/reports/content/2026/data.txt')).statusCode).toBe(415)
  })

  it('allows regenerating a report with provenance', async () => {
    const { app, cookie } = await fixture()
    const res = await app.inject({ method: 'POST', url: '/api/reports/regenerate/2026/brief.html', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json().sessionId).toBeDefined()
  })

  it('fails to regenerate a report without provenance', async () => {
    const { app, cookie } = await fixture()
    const res = await app.inject({ method: 'POST', url: '/api/reports/regenerate/2026/notes.md', headers: { cookie } })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toContain('Report provenance not found')
  })
})
