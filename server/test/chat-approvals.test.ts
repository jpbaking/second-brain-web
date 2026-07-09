import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import { AgentSessionService } from '../src/agent/session.js'
import { readEventsSince } from '../src/agent/chat-store.js'
import type { AgentRunner, AgentStartInput, AgentStartResult } from '../src/agent/runner.js'
import type { ProviderSnapshot } from '../src/providers/snapshot.js'
import type { DatabaseSync } from 'node:sqlite'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const dbs: DatabaseSync[] = []
const apps: FastifyInstance[] = []

/** Captures the requestToolApproval capability handed in at start(). */
class CapturingRunner implements AgentRunner {
  approval: AgentStartInput['capabilities'] | undefined
  private n = 0
  async start (input: AgentStartInput): Promise<AgentStartResult> {
    if (input.capabilities !== undefined) this.approval = input.capabilities
    return { sessionId: `sdk-${++this.n}` }
  }

  async send (): Promise<void> {}
  subscribe (): () => void { return () => {} }
  async readMessages (): Promise<unknown[]> { return [] }
  async stop (): Promise<void> {}
}

function snap (): ProviderSnapshot {
  return { profileId: 'p', displayName: 'D', providerId: 'openai-compatible', modelId: 'm', baseUrl: 'http://127.0.0.1:1234/v1', headers: null, apiKey: null }
}

function freshDb (): DatabaseSync {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-appr-'))
  scratch.push(root)
  const dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dataDir)
  const db = openCoreDb(dataDir)
  dbs.push(db)
  return db
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const db of dbs.splice(0)) db.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function startedSession (db: DatabaseSync, runner: AgentRunner): Promise<{ svc: AgentSessionService, chatId: string }> {
  const svc = new AgentSessionService(db, runner, { snapshotFor: () => snap(), vaultCwd: '/vault' })
  const session = svc.create({ title: 'C' })
  await svc.sendMessage(session.id, 'hi') // → sdk-1 mapped
  return { svc, chatId: session.id }
}

describe('AgentSessionService approvals', () => {
  it('auto-denies a library/ write without parking (guard runs first)', async () => {
    const db = freshDb()
    const { svc, chatId } = await startedSession(db, new CapturingRunner())
    const decision = await svc.requestToolApproval({
      sessionId: 'sdk-1', toolCallId: 't1', toolName: 'editor', input: { path: 'library/2026/original.txt' },
    })
    expect(decision.approved).toBe(false)
    expect(decision.reason).toMatch(/library/)
    expect(readEventsSince(db, chatId, 0).some(e => e.type === 'approval_auto_denied')).toBe(true)
    // Resolving a toolCallId that never parked returns false.
    expect(svc.resolveApproval('t1', true)).toBe(false)
  })

  it('parks an ask-tool approval and continues once resolved', async () => {
    const db = freshDb()
    const { svc, chatId } = await startedSession(db, new CapturingRunner())
    const pending = svc.requestToolApproval({
      sessionId: 'sdk-1', toolCallId: 't2', toolName: 'editor', input: { path: 'notes/scratch.md' },
    })
    // The request is streamed but not yet resolved.
    expect(readEventsSince(db, chatId, 0).some(e => e.type === 'approval_request')).toBe(true)
    let settled = false
    pending.then(() => { settled = true }).catch(() => {})
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(settled).toBe(false)

    expect(svc.resolveApproval('t2', true)).toBe(true)
    expect(await pending).toEqual({ approved: true })
    expect(readEventsSince(db, chatId, 0).some(e => e.type === 'approval_resolved')).toBe(true)
  })

  it('parks and denies an unknown tool (never silently auto-approved)', async () => {
    const db = freshDb()
    const { svc } = await startedSession(db, new CapturingRunner())
    const pending = svc.requestToolApproval({ sessionId: 'sdk-1', toolCallId: 't3', toolName: 'mystery_tool', input: {} })
    expect(svc.resolveApproval('t3', false, 'not allowed')).toBe(true)
    expect(await pending).toEqual({ approved: false, reason: 'not allowed' })
  })
})

import { readLock } from '../src/vault/lock.js'

describe('AgentSessionService locks', () => {
  it('acquires lock for high-trust mutating tool and releases on end', async () => {
    const db = freshDb()
    const svc = new AgentSessionService(db, new CapturingRunner(), { snapshotFor: () => snap(), vaultCwd: '/vault' })
    const session = svc.create({ title: 'H', approvalPreset: 'high-trust' })
    await svc.sendMessage(session.id, 'hi')
    
    // high-trust allows mutating tools, which triggers lock acquisition
    const decision = await svc.requestToolApproval({
      sessionId: 'sdk-1', toolCallId: 't1', toolName: 'editor', input: { path: 'notes/scratch.md' }
    })
    expect(decision.approved).toBe(true)
    
    const lock1 = readLock(db)
    expect(lock1.held).toBe(true)
    expect(lock1.lock?.sessionId).toBe(session.id)
    
    // send end event (which releases lock)
    // using internal handleSdkEvent for tests
    ;(svc as any).handleSdkEvent({ type: 'ended', sessionId: 'sdk-1' })
    
    const lock2 = readLock(db)
    expect(lock2.held).toBe(false)
  })

  it('prevents concurrent mutating sessions', async () => {
    const db = freshDb()
    const svc = new AgentSessionService(db, new CapturingRunner(), { snapshotFor: () => snap(), vaultCwd: '/vault' })
    
    // session 1
    const s1 = svc.create({ title: '1', approvalPreset: 'high-trust' })
    await svc.sendMessage(s1.id, 'hi')
    
    // session 2
    const s2 = svc.create({ title: '2', approvalPreset: 'high-trust' })
    // We need to inject a runner that maps to sdk-2 for s2.
    // The CapturingRunner returns sdk-X where X increments.
    await svc.sendMessage(s2.id, 'hi') // this gets sdk-2
    
    // s1 acquires lock
    const d1 = await svc.requestToolApproval({
      sessionId: 'sdk-1', toolCallId: 't1', toolName: 'editor', input: { path: 'notes/scratch.md' }
    })
    expect(d1.approved).toBe(true)
    
    // s2 tries to acquire lock and is denied
    const d2 = await svc.requestToolApproval({
      sessionId: 'sdk-2', toolCallId: 't2', toolName: 'editor', input: { path: 'notes/scratch.md' }
    })
    expect(d2.approved).toBe(false)
    expect(d2.reason).toMatch(/holds the vault lock/)
  })
})

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  const c = list.find(x => x.startsWith(`${name}=`))
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

describe('approval route', () => {
  it('resolves a parked approval over HTTP', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-apprapi-'))
    scratch.push(root)
    const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'k' })
    prepareDatabases(config.dataDir)
    const { password, state } = await generateOwnerAuth()
    writeOwnerAuth(config.dataDir, state)
    const runner = new CapturingRunner()
    const app = buildApp(config, { agentRunner: runner })
    apps.push(app)

    const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
    const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
    const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
    const totp = await app.inject({ method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code } })
    const cookie = `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`

    await app.inject({ method: 'POST', url: '/api/providers', headers: { cookie }, payload: { displayName: 'L', providerId: 'openai-compatible', modelId: 'm', baseUrl: 'http://127.0.0.1:1234/v1', isDefault: true } })
    const id = (await app.inject({ method: 'POST', url: '/api/chat/sessions', headers: { cookie }, payload: { title: 'C' } })).json().id
    await app.inject({ method: 'POST', url: `/api/chat/sessions/${id}/messages`, headers: { cookie }, payload: { text: 'hi' } })

    // The SDK asks for approval of an ask-tool; the promise parks.
    const pending = runner.approval?.requestToolApproval({ sessionId: 'sdk-1', toolCallId: 'call-9', toolName: 'editor', input: { path: 'notes/x.md' } })
    expect(pending).toBeDefined()

    const res = await app.inject({ method: 'POST', url: `/api/chat/sessions/${id}/approvals/call-9`, headers: { cookie }, payload: { approved: true } })
    expect(res.statusCode).toBe(200)
    expect(await pending).toEqual({ approved: true })

    // Resolving an unknown toolCallId 404s.
    const missing = await app.inject({ method: 'POST', url: `/api/chat/sessions/${id}/approvals/nope`, headers: { cookie }, payload: { approved: true } })
    expect(missing.statusCode).toBe(404)
  })
})
