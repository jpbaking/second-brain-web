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
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

class FakeRunner implements AgentRunner {
  starts: AgentStartInput[] = []
  async start (input: AgentStartInput): Promise<AgentStartResult> {
    this.starts.push(input)
    return { sessionId: `sdk-${this.starts.length}` }
  }

  async send (): Promise<void> {}
  subscribe (): () => void { return () => {} }
  async readMessages (): Promise<unknown[]> { return [] }
  async stop (): Promise<void> {}
}

function cookieValue (header: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header]
  return values.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0]
}

async function authedApp (withWorkflow = true): Promise<{ app: FastifyInstance, cookie: string, runner: FakeRunner }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-post-upload-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') })
  prepareDatabases(config.dataDir)
  if (withWorkflow) {
    const workflows = path.join(vaultWorkspacePath(config.dataDir), '.clinerules', 'workflows')
    mkdirSync(workflows, { recursive: true })
    writeFileSync(path.join(workflows, 'inbox.md'), 'INBOX WORKFLOW MARKER')
  }
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
  const runner = new FakeRunner()
  const app = buildApp(config, { agentRunner: runner })
  apps.push(app)
  const passwordResponse = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(passwordResponse.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({
    method: 'POST',
    url: '/api/auth/totp',
    headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` },
    payload: { code },
  })
  const cookie = `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`
  await app.inject({
    method: 'POST',
    url: '/api/providers',
    headers: { cookie },
    payload: { displayName: 'Local', providerId: 'openai-compatible', modelId: 'm', baseUrl: 'http://127.0.0.1:1234/v1', isDefault: true },
  })
  return { app, cookie, runner }
}

function multipart (): { payload: Buffer, contentType: string } {
  const boundary = '----second-brain-post-upload'
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="source.txt"\r\n` +
      'Content-Type: text/plain\r\n\r\ncontent\r\n' +
      `--${boundary}--\r\n`
    ),
  }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('post-upload inbox processing', () => {
  it('expands and dispatches the vault inbox workflow for the uploaded intake', async () => {
    const { app, cookie, runner } = await authedApp()
    const body = multipart()
    const uploaded = await app.inject({
      method: 'POST', url: '/api/uploads', headers: { cookie, 'content-type': body.contentType }, payload: body.payload,
    })
    expect(uploaded.statusCode).toBe(201)

    const response = await app.inject({
      method: 'POST', url: `/api/uploads/${uploaded.json().uploadId}/process`, headers: { cookie },
    })
    expect(response.statusCode).toBe(202)
    expect(response.json().sessionId).toEqual(expect.any(String))
    expect(runner.starts).toHaveLength(1)
    expect(runner.starts[0]?.prompt).toContain('INBOX WORKFLOW MARKER')
    expect(runner.starts[0]?.prompt).toContain(uploaded.json().path)
    expect(runner.starts[0]?.prompt).toContain('_intake.md')

    const sessions = await app.inject({ method: 'GET', url: '/api/chat/sessions', headers: { cookie } })
    expect(sessions.json().sessions[0].title).toBe(`Inbox: ${uploaded.json().uploadId}`)
    expect(sessions.json().sessions[0].approvalPreset).toBe('high-trust')
  })

  it('rejects invalid or missing upload identifiers without dispatching', async () => {
    const { app, cookie, runner } = await authedApp()
    const invalid = await app.inject({ method: 'POST', url: '/api/uploads/..%2Fescape/process', headers: { cookie } })
    expect(invalid.statusCode).toBe(400)
    const missing = await app.inject({ method: 'POST', url: '/api/uploads/2026-07-10_170000_abcdef/process', headers: { cookie } })
    expect(missing.statusCode).toBe(404)
    expect(runner.starts).toHaveLength(0)
  })

  it('reports when the vault inbox workflow is unavailable', async () => {
    const { app, cookie, runner } = await authedApp(false)
    const body = multipart()
    const uploaded = await app.inject({
      method: 'POST', url: '/api/uploads', headers: { cookie, 'content-type': body.contentType }, payload: body.payload,
    })
    const response = await app.inject({
      method: 'POST', url: `/api/uploads/${uploaded.json().uploadId}/process`, headers: { cookie },
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error).toMatch(/workflow/i)
    expect(runner.starts).toHaveLength(0)
  })
})
