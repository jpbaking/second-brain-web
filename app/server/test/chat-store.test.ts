import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import {
  appendEvent,
  closeSession,
  createSession,
  getSession,
  getSessionBySdkId,
  listSessions,
  readEventsSince,
  renameSession,
  setSdkSessionId,
  saveCompaction,
} from '../src/agent/chat-store.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []

function freshDb (): DatabaseSync {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-chat-'))
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

describe('chat session store', () => {
  it('creates, lists, gets, renames, and closes a session', () => {
    const db = freshDb()
    const s = createSession(db, { title: 'First', providerProfileId: 'prof-1' })
    expect(s).toMatchObject({ title: 'First', providerProfileId: 'prof-1', sdkSessionId: null, status: 'active', approvalPreset: 'normal' })

    const s2 = createSession(db, { title: 'Second', approvalPreset: 'high-trust' })
    expect(s2.approvalPreset).toBe('high-trust')

    expect(getSession(db, s.id)?.title).toBe('First')
    expect(listSessions(db)).toHaveLength(2)

    expect(renameSession(db, s.id, 'Renamed')).toBe(true)
    expect(getSession(db, s.id)?.title).toBe('Renamed')

    expect(closeSession(db, s.id)).toBe(true)
    expect(getSession(db, s.id)?.status).toBe('closed')

    expect(renameSession(db, 'nope', 'x')).toBe(false)
  })

  it('bumps updated_at on appended events so the last-active chat lists first', () => {
    const db = freshDb()
    const older = createSession(db, { title: 'Older' }, new Date('2026-07-11T10:00:00Z'))
    createSession(db, { title: 'Newer' }, new Date('2026-07-11T11:00:00Z'))
    expect(listSessions(db)[0]?.title).toBe('Newer')

    // Activity on the older session makes it the most recently active.
    appendEvent(db, older.id, 'user_message', { text: 'hi' }, new Date('2026-07-11T12:00:00Z'))
    expect(listSessions(db)[0]?.title).toBe('Older')
  })

  it('binds and resolves the SDK session id (rehydration mapping)', () => {
    const db = freshDb()
    const s = createSession(db, { title: 'S' })
    expect(setSdkSessionId(db, s.id, 'sdk-abc')).toBe(true)
    expect(getSession(db, s.id)?.sdkSessionId).toBe('sdk-abc')
    expect(getSessionBySdkId(db, 'sdk-abc')?.id).toBe(s.id)
    // Rebind on resume (new SDK session id after a restart).
    setSdkSessionId(db, s.id, 'sdk-def')
    expect(getSessionBySdkId(db, 'sdk-abc')).toBeUndefined()
    expect(getSessionBySdkId(db, 'sdk-def')?.id).toBe(s.id)
  })

  it('saves and retrieves compaction state', () => {
    const db = freshDb()
    const s = createSession(db, { title: 'Compaction Test' })
    expect(s.compactionSummary).toBeNull()
    expect(s.compactedAt).toBeNull()

    expect(saveCompaction(db, s.id, 'My Summary')).toBe(true)

    const updated = getSession(db, s.id)
    expect(updated?.compactionSummary).toBe('My Summary')
    expect(updated?.compactedAt).toBeDefined()
  })
})

describe('chat event log', () => {
  it('assigns a monotonic per-session seq and replays from a cursor', () => {
    const db = freshDb()
    const a = createSession(db, { title: 'A' })
    const b = createSession(db, { title: 'B' })

    const e1 = appendEvent(db, a.id, 'user_message', { text: 'hi' })
    const e2 = appendEvent(db, a.id, 'chunk', { text: 'he' })
    const e3 = appendEvent(db, a.id, 'chunk', { text: 'llo' })
    expect([e1.seq, e2.seq, e3.seq]).toEqual([1, 2, 3])

    // Per-session seq is independent between sessions.
    const b1 = appendEvent(db, b.id, 'user_message', { text: 'other' })
    expect(b1.seq).toBe(1)

    // Replay everything, then only newer than a cursor.
    expect(readEventsSince(db, a.id, 0).map(e => e.seq)).toEqual([1, 2, 3])
    const since = readEventsSince(db, a.id, 1)
    expect(since.map(e => e.seq)).toEqual([2, 3])
    expect(since[0]?.payload).toEqual({ text: 'he' })
  })

  it('round-trips a null payload and rejects an unknown session', () => {
    const db = freshDb()
    const s = createSession(db, { title: 'S' })
    const e = appendEvent(db, s.id, 'ended')
    expect(e.payload).toBe(null)
    expect(readEventsSince(db, s.id)[0]?.payload).toBe(null)
    expect(() => appendEvent(db, 'ghost', 'x')).toThrow(/unknown chat session/)
  })

  it('cascades events on session delete via FK', () => {
    const db = freshDb()
    const s = createSession(db, { title: 'S' })
    appendEvent(db, s.id, 'user_message', { text: 'hi' })
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(s.id)
    expect(db.prepare('SELECT COUNT(*) AS n FROM chat_events').get()).toEqual({ n: 0 })
  })
})
