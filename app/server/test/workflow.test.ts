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
import { WorkflowNotFoundError, expandWorkflow, listWorkflows, workflowsDir } from '../src/agent/workflows.js'
import type { AgentRunner, AgentStartInput, AgentStartResult } from '../src/agent/runner.js'
import type { FastifyInstance } from 'fastify'
import { seedDefaultProvider } from './helpers/seed-provider.js'

const scratch: string[] = []
const apps: FastifyInstance[] = []

class CapturingRunner implements AgentRunner {
  starts: AgentStartInput[] = []
  private n = 0
  async start (input: AgentStartInput): Promise<AgentStartResult> { this.starts.push(input); return { sessionId: `sdk-${++this.n}` } }
  async send (): Promise<void> {}
  subscribe (): () => void { return () => {} }
  async readMessages (): Promise<unknown[]> { return [] }
  async stop (): Promise<void> {}
}

function seedWorkflows (vaultCwd: string): void {
  mkdirSync(workflowsDir(vaultCwd), { recursive: true })
  writeFileSync(path.join(workflowsDir(vaultCwd), 'inbox.md'), '# Inbox\nFile everything under inbox/.\n')
  writeFileSync(path.join(workflowsDir(vaultCwd), 'report.md'), '# Report\nSummarise the week.\n')
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('workflow expansion (unit)', () => {
  it('lists and expands workflow files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-wf-'))
    scratch.push(root)
    seedWorkflows(root)

    expect(listWorkflows(root)).toEqual(['inbox', 'report'])
    const expanded = expandWorkflow(root, 'inbox')
    expect(expanded.startsWith('Run the following workflow now.\n\n')).toBe(true)
    expect(expanded).toContain('File everything under inbox/.')
    // A /name shortcut is accepted.
    expect(expandWorkflow(root, '/inbox')).toBe(expanded)

    // Parameters are interpolated.
    const paramsExpanded = expandWorkflow(root, 'inbox', { Title: 'Sync meeting', Date: 'Today' })
    expect(paramsExpanded).toContain('[Parameters]\nTitle: Sync meeting\nDate: Today\n\n# Inbox')
  })

  it('returns [] when there is no workflows dir', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-wf-'))
    scratch.push(root)
    expect(listWorkflows(root)).toEqual([])
  })

  it('rejects unknown workflows and traversal', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-wf-'))
    scratch.push(root)
    seedWorkflows(root)
    expect(() => expandWorkflow(root, 'nope')).toThrow(WorkflowNotFoundError)
    expect(() => expandWorkflow(root, '../secrets')).toThrow(/invalid workflow/)
    expect(() => expandWorkflow(root, 'sub/evil')).toThrow(/invalid workflow/)
  })
})

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  const c = list.find(x => x.startsWith(`${name}=`))
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

describe('workflow command route', () => {
  it('expands a workflow command into a dispatched message; 404 unknown', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-wfapi-'))
    scratch.push(root)
    const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'k' })
    prepareDatabases(config.dataDir)
    seedWorkflows(vaultWorkspacePath(config.dataDir))
    const { password, state } = await generateOwnerAuth()
    writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
    const runner = new CapturingRunner()
    const app = buildApp(config, { agentRunner: runner })
    apps.push(app)

    const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
    const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
    const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
    const totp = await app.inject({ method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code } })
    const cookie = `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`

    // Workflow list route.
    const wf = await app.inject({ method: 'GET', url: '/api/chat/workflows', headers: { cookie } })
    expect(wf.json().workflows).toEqual(['inbox', 'report'])

    seedDefaultProvider(config.dataDir)
    const id = (await app.inject({ method: 'POST', url: '/api/chat/sessions', headers: { cookie }, payload: { title: 'C' } })).json().id

    const run = await app.inject({ method: 'POST', url: `/api/chat/sessions/${id}/commands`, headers: { cookie }, payload: { command: 'inbox' } })
    expect(run.statusCode).toBe(202)
    // Dispatched as a real message: the SDK start prompt carries the expanded workflow.
    expect(runner.starts).toHaveLength(1)
    expect(runner.starts[0]?.prompt).toContain('Run the following workflow now.')
    expect(runner.starts[0]?.prompt).toContain('File everything under inbox/.')

    const missing = await app.inject({ method: 'POST', url: `/api/chat/sessions/${id}/commands`, headers: { cookie }, payload: { command: 'ghost' } })
    expect(missing.statusCode).toBe(404)
  })

  it('provides a dedicated prep workflow endpoint', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-wfapi-prep-'))
    scratch.push(root)
    const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'k' })
    prepareDatabases(config.dataDir)
    seedWorkflows(vaultWorkspacePath(config.dataDir))
    writeFileSync(path.join(workflowsDir(vaultWorkspacePath(config.dataDir)), 'prep.md'), '# Prep\nRun prep.\n')

    const { password, state } = await generateOwnerAuth()
    writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
    const runner = new CapturingRunner()
    const app = buildApp(config, { agentRunner: runner })
    apps.push(app)

    const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
    const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
    const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
    const totp = await app.inject({ method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code } })
    const cookie = `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`
    seedDefaultProvider(config.dataDir)

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/workflows/prep',
      headers: { cookie },
      payload: { title: 'Q3 Planning', date: 'Tomorrow', attendees: 'Alice, Bob', objective: 'Plan Q3' }
    })
    expect(res.statusCode).toBe(201)

    expect(runner.starts).toHaveLength(1)
    const prompt = runner.starts[0]?.prompt ?? ''
    expect(prompt).toContain('[Parameters]')
    expect(prompt).toContain('Title: Q3 Planning')
    expect(prompt).toContain('Date: Tomorrow')
    expect(prompt).toContain('Attendees: Alice, Bob')
    expect(prompt).toContain('Objective: Plan Q3')
    expect(prompt).toContain('# Prep\nRun prep.')
  })
})
