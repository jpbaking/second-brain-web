import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { AgentSessionService } from '../src/agent/session.js'
import { getSession, readEventsSince, saveCompaction } from '../src/agent/chat-store.js'
import type { AgentRunner, AgentStartInput, AgentStartResult } from '../src/agent/runner.js'
import type { ProviderSnapshot } from '../src/providers/snapshot.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []

function freshDb (): DatabaseSync {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-agentsess-'))
  scratch.push(root)
  const dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dataDir)
  const db = openCoreDb(dataDir)
  dbs.push(db)
  return db
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Records every SDK interaction and hands out incrementing session ids. */
class FakeRunner implements AgentRunner {
  starts: AgentStartInput[] = []
  sends: Array<{ sessionId: string, text?: string }> = []
  messagesById = new Map<string, unknown[]>()
  private n = 0

  async start (input: AgentStartInput): Promise<AgentStartResult> {
    this.starts.push(input)
    const sessionId = `sdk-${++this.n}`
    // Seed a couple of persisted messages so a later readMessages returns them.
    this.messagesById.set(sessionId, [{ role: 'user', content: input.prompt ?? '(resumed)' }])
    return { sessionId }
  }

  async send (sessionId: string, input: { type: string, text?: string }): Promise<void> {
    this.sends.push({ sessionId, text: input.text })
  }

  private listeners = new Set<(event: unknown) => void>()

  subscribe (listener: (event: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit (event: unknown): void {
    for (const listener of this.listeners) listener(event)
  }

  async readMessages (sessionId: string): Promise<unknown[]> { return this.messagesById.get(sessionId) ?? [] }
  async stop (): Promise<void> {}
}

function snap (over: Partial<ProviderSnapshot>): ProviderSnapshot {
  return {
    profileId: 'prof-1',
    displayName: 'Default',
    providerId: 'openai-compatible',
    modelId: 'model-a',
    baseUrl: 'http://127.0.0.1:1234/v1',
    headers: null,
    apiKey: 'sk-secret',
    ...over,
  }
}

describe('AgentSessionService', () => {
  it('creates a session, captures non-secret config, and starts on first message', async () => {
    const db = freshDb()
    const runner = new FakeRunner()
    const svc = new AgentSessionService(db, runner, { snapshotFor: () => snap({}), vaultCwd: '/vault' })

    const session = svc.create({ title: 'Chat 1' })
    // Captured config event has provider/model but never the key.
    svc.flushEvents()
    const captured = readEventsSince(db, session.id, 0).find(e => e.type === 'session_config')
    expect(captured?.payload).toMatchObject({ providerId: 'openai-compatible', modelId: 'model-a' })
    expect(JSON.stringify(captured?.payload)).not.toContain('sk-secret')

    const res = await svc.sendMessage(session.id, 'hello')
    expect(res.accepted).toBe(true)
    await new Promise(r => setTimeout(r, 10))
    // First message starts the SDK session with the prompt (not send()).
    expect(runner.starts).toHaveLength(1)
    expect(runner.starts[0]?.prompt).toBe('hello')
    expect(runner.starts[0]?.config).toMatchObject({ providerId: 'openai-compatible', modelId: 'model-a', apiKey: 'sk-secret', cwd: '/vault' })
    expect(runner.sends).toHaveLength(0)
    // Mapping + user_message event persisted.
    expect(getSession(db, session.id)?.sdkSessionId).toBe('sdk-1')
    svc.flushEvents()
    expect(readEventsSince(db, session.id, 0).some(e => e.type === 'user_message')).toBe(true)
  })

  it('sends subsequent messages to the live session without restarting', async () => {
    const db = freshDb()
    const runner = new FakeRunner()
    const svc = new AgentSessionService(db, runner, { snapshotFor: () => snap({}), vaultCwd: '/vault' })
    const session = svc.create({ title: 'C' })
    await svc.sendMessage(session.id, 'first')
    await svc.sendMessage(session.id, 'second')
    expect(runner.starts).toHaveLength(1)
    expect(runner.sends).toEqual([{ sessionId: 'sdk-1', text: 'second' }])
  })

  it('rehydrates after a simulated restart via readMessages + initialMessages', async () => {
    const db = freshDb()
    const runner = new FakeRunner()
    const opts = { snapshotFor: () => snap({}), vaultCwd: '/vault' }

    // Process A: create + one message → sdk-1 persisted.
    const svcA = new AgentSessionService(db, runner, opts)
    const session = svcA.create({ title: 'C' })
    await svcA.sendMessage(session.id, 'm1')

    // Process B: resume session
    const svcB = new AgentSessionService(db, runner, opts)
    const res = await svcB.resume(session.id)
    expect(res.sdkSessionId).toBe('sdk-2')
    expect(res.rehydratedMessages).toBe(1)
    expect(runner.starts).toHaveLength(2)
    // The restart start() should receive the initialMessages from readMessages().
    expect(runner.starts[1]?.initialMessages).toEqual([{ role: 'user', content: 'm1' }])
  })

  it('rehydrates using compaction summary when available, omitting prior messages', async () => {
    const db = freshDb()
    const runner = new FakeRunner()
    const opts = { snapshotFor: () => snap({}), vaultCwd: '/vault' }

    const svcA = new AgentSessionService(db, runner, opts)
    const session = svcA.create({ title: 'C' })
    await svcA.sendMessage(session.id, 'm1')

    // Simulate compaction
    saveCompaction(db, session.id, 'summary data')

    // Resume session
    const svcB = new AgentSessionService(db, runner, opts)
    const res = await svcB.resume(session.id)
    expect(res.sdkSessionId).toBe('sdk-2')
    expect(res.rehydratedMessages).toBe(1)
    expect(runner.starts[1]?.initialMessages).toEqual([
      { role: 'user', content: 'SYSTEM: Resuming session from compacted context:\n\n<compaction_summary>\nsummary data\n</compaction_summary>' }
    ])
  })

  it('uses the config captured at start even after the profile is edited', async () => {
    const db = freshDb()
    const runner = new FakeRunner()
    // Mutable snapshot source: model changes after creation.
    let current = snap({ modelId: 'model-a' })
    const svc = new AgentSessionService(db, runner, { snapshotFor: () => current, vaultCwd: '/vault' })

    const session = svc.create({ title: 'C' })
    current = snap({ modelId: 'model-EDITED' }) // profile edited later

    await svc.sendMessage(session.id, 'hi')
    // The started model must be the captured one, not the edited one.
    expect(runner.starts[0]?.config.modelId).toBe('model-a')
  })

  it('refuses to create a session when no provider profile resolves', () => {
    const db = freshDb()
    const svc = new AgentSessionService(db, new FakeRunner(), { snapshotFor: () => undefined, vaultCwd: '/vault' })
    expect(() => svc.create({ title: 'C' })).toThrow(/provider profile/)
  })

  it('processes compaction summary upon ended event and emits compaction event', async () => {
    const db = freshDb()
    const runner = new FakeRunner()
    const svc = new AgentSessionService(db, runner, { snapshotFor: () => snap({}), vaultCwd: '/vault' })
    const s = svc.create({ title: 'Compaction', providerProfileId: 'p-1' })
    await svc.compactSession(s.id)

    // Simulate agent streaming the summary
    const sdkId = getSession(db, s.id)!.sdkSessionId!
    const summaryXML = `<compaction_summary>
      Task state: completed
      Vault status: clean
    </compaction_summary>`
    runner.emit({ type: 'chunk', sessionId: sdkId, payload: { text: 'Here is the summary:\n' } })
    runner.emit({ type: 'chunk', sessionId: sdkId, payload: { text: summaryXML } })

    // Simulate turn ending
    let emittedCompaction: unknown = null
    svc.onEvent(s.id, (e) => { if (e.type === 'compaction') emittedCompaction = e.payload })
    runner.emit({ type: 'ended', sessionId: sdkId, payload: null })

    const updated = getSession(db, s.id)
    expect(updated?.compactionSummary).toContain('Task state: completed')
    expect(updated?.compactedAt).toBeDefined()
    expect(emittedCompaction).toEqual({ summary: 'Task state: completed\n      Vault status: clean' })
  })

  it('automatically triggers compaction when char threshold is exceeded', async () => {
    const originalThreshold = (AgentSessionService as any).AUTO_COMPACTION_CHAR_THRESHOLD
    ;(AgentSessionService as any).AUTO_COMPACTION_CHAR_THRESHOLD = 50
    try {
      const db = freshDb()
      const runner = new FakeRunner()
      const svc = new AgentSessionService(db, runner, { snapshotFor: () => snap({}), vaultCwd: '/vault' })
      const s = svc.create({ title: 'AutoCompact', providerProfileId: 'p-1' })
      await svc.sendMessage(s.id, 'x'.repeat(60)) // > 50 chars

      const sdkId = getSession(db, s.id)!.sdkSessionId!
      // Turn ends
      runner.emit({ type: 'ended', sessionId: sdkId, payload: null })

      // Let microtasks clear for the async compactSession start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Auto-compaction should trigger and append 'compaction_requested'
      svc.flushEvents()
      const events = readEventsSince(db, s.id, 0)
      const requested = events.some(e => e.type === 'compaction_requested')
      expect(requested).toBe(true)

      // The runner should have been started a second time (for the compaction request)
      expect(runner.starts.length).toBe(2)
      expect(runner.starts[1]?.prompt).toContain('Please generate a concise summary')
    } finally {
      ;(AgentSessionService as any).AUTO_COMPACTION_CHAR_THRESHOLD = originalThreshold
    }
  })

  it('does not trigger auto-compaction if under threshold', async () => {
    const originalThreshold = (AgentSessionService as any).AUTO_COMPACTION_CHAR_THRESHOLD
    ;(AgentSessionService as any).AUTO_COMPACTION_CHAR_THRESHOLD = 50
    try {
      const db = freshDb()
      const runner = new FakeRunner()
      const svc = new AgentSessionService(db, runner, { snapshotFor: () => snap({}), vaultCwd: '/vault' })
      const s = svc.create({ title: 'NoCompact', providerProfileId: 'p-1' })
      await svc.sendMessage(s.id, 'short') // < 50 chars

      const sdkId = getSession(db, s.id)!.sdkSessionId!
      runner.emit({ type: 'ended', sessionId: sdkId, payload: null })

      await new Promise(resolve => setTimeout(resolve, 10))

      svc.flushEvents()
      const events = readEventsSince(db, s.id, 0)
      const requested = events.some(e => e.type === 'compaction_requested')
      expect(requested).toBe(false)
    } finally {
      ;(AgentSessionService as any).AUTO_COMPACTION_CHAR_THRESHOLD = originalThreshold
    }
  })

  it('does not trigger auto-compaction while already compacting', async () => {
    const originalThreshold = (AgentSessionService as any).AUTO_COMPACTION_CHAR_THRESHOLD
    ;(AgentSessionService as any).AUTO_COMPACTION_CHAR_THRESHOLD = 50
    try {
      const db = freshDb()
      const runner = new FakeRunner()
      const svc = new AgentSessionService(db, runner, { snapshotFor: () => snap({}), vaultCwd: '/vault' })
      const s = svc.create({ title: 'AlreadyCompacting', providerProfileId: 'p-1' })
      await svc.sendMessage(s.id, 'x'.repeat(60)) // > 50 chars

      const sdkId = getSession(db, s.id)!.sdkSessionId!
      runner.emit({ type: 'ended', sessionId: sdkId, payload: null })

      await new Promise(resolve => setTimeout(resolve, 10))
      svc.flushEvents()
      const events1 = readEventsSince(db, s.id, 0)
      expect(events1.filter(e => e.type === 'compaction_requested').length).toBe(1)

      // Simulate another ended event (e.g. agent produced no summary)
      const newSdkId = getSession(db, s.id)!.sdkSessionId!
      runner.emit({ type: 'ended', sessionId: newSdkId, payload: null })

      await new Promise(resolve => setTimeout(resolve, 10))
      svc.flushEvents()
      const events2 = readEventsSince(db, s.id, 0)
      // Should STILL be 1, because currentlyCompacting was true
      expect(events2.filter(e => e.type === 'compaction_requested').length).toBe(1)
    } finally {
      ;(AgentSessionService as any).AUTO_COMPACTION_CHAR_THRESHOLD = originalThreshold
    }
  })

  it('saves report provenance upon session completion for new reports', async () => {
    const db = freshDb()
    const runner = new FakeRunner()

    const vaultCwd = path.join(scratch[scratch.length - 1]!, 'vault')
    mkdirSync(path.join(vaultCwd, 'reports'), { recursive: true })
    execSync('git init', { cwd: vaultCwd })
    execSync('git config user.name "Test"', { cwd: vaultCwd })
    execSync('git config user.email "test@example.com"', { cwd: vaultCwd })
    execSync('git commit --allow-empty -m "initial"', { cwd: vaultCwd })

    const svc = new AgentSessionService(db, runner, { snapshotFor: () => snap({}), vaultCwd })
    const s = svc.create({ title: 'ReportGen', providerProfileId: 'p-1' })

    // Ensure session creation time is strictly before the report creation time
    await new Promise(resolve => setTimeout(resolve, 10))
    await svc.sendMessage(s.id, 'Write a new report')

    writeFileSync(path.join(vaultCwd, 'reports', 'test-report.md'), '# Test Report\n\nContent.')
    const sdkId = getSession(db, s.id)!.sdkSessionId!

    runner.emit({ type: 'ended', sessionId: sdkId, payload: null })
    await new Promise(resolve => setTimeout(resolve, 500))

    const row = db.prepare('SELECT * FROM report_provenance WHERE report_path = ?').get('test-report.md') as any
    expect(row).toBeDefined()
    expect(row.session_id).toBe(s.id)
    expect(row.prompt).toBe('Write a new report')
    expect(row.provider_profile_id).toBe('prof-1')
    expect(row.vault_commit).toBeDefined()
  })
})
