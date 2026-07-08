import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import {
  createSession,
  findActiveSession,
  hashSessionToken,
  purgeExpiredSessions,
  revokeAllSessions,
  revokeSession,
  touchSession,
} from '../src/auth/sessions.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const open: DatabaseSync[] = []
function coreDb (): DatabaseSync {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-sessions-'))
  scratch.push(root)
  const dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dataDir)
  const db = openCoreDb(dataDir)
  open.push(db)
  return db
}

afterEach(() => {
  for (const db of open.splice(0)) db.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('session store', () => {
  it('creates a session that can be looked up by its token', () => {
    const db = coreDb()
    const created = createSession(db, { userAgent: 'ua', ip: '10.0.0.1' })
    const found = findActiveSession(db, created.token)
    expect(found?.id).toBe(created.id)
    expect(found?.userAgent).toBe('ua')
    expect(found?.ip).toBe('10.0.0.1')
  })

  it('stores only the hashed token, never the raw token', () => {
    const db = coreDb()
    const created = createSession(db)
    const row = db.prepare('SELECT token_hash FROM sessions WHERE id = ?').get(created.id) as { token_hash: string }
    expect(row.token_hash).toBe(hashSessionToken(created.token))
    expect(row.token_hash).not.toBe(created.token)
  })

  it('does not return an expired session', () => {
    const db = coreDb()
    const past = new Date('2020-01-01T00:00:00Z')
    const created = createSession(db, { now: past, ttlMs: 1000 })
    // Look up well after expiry.
    expect(findActiveSession(db, created.token, new Date('2020-01-01T01:00:00Z'))).toBeUndefined()
    // ...but valid within the window.
    expect(findActiveSession(db, created.token, new Date('2020-01-01T00:00:00.500Z'))?.id).toBe(created.id)
  })

  it('does not return a revoked session', () => {
    const db = coreDb()
    const created = createSession(db)
    revokeSession(db, created.id)
    expect(findActiveSession(db, created.token)).toBeUndefined()
  })

  it('revoke-all invalidates every active session and reports the count', () => {
    const db = coreDb()
    const a = createSession(db)
    const b = createSession(db)
    expect(revokeAllSessions(db)).toBe(2)
    expect(findActiveSession(db, a.token)).toBeUndefined()
    expect(findActiveSession(db, b.token)).toBeUndefined()
  })

  it('touch updates last_used_at', () => {
    const db = coreDb()
    const created = createSession(db, { now: new Date('2021-01-01T00:00:00Z') })
    const later = new Date('2021-01-01T06:00:00Z') // within the 24h window
    touchSession(db, created.id, later)
    const found = findActiveSession(db, created.token, later)
    expect(found?.lastUsedAt).toBe('2021-01-01T06:00:00.000Z')
  })

  it('purges expired and revoked sessions', () => {
    const db = coreDb()
    const live = createSession(db, { ttlMs: 60_000 })
    const expired = createSession(db, { now: new Date('2020-01-01T00:00:00Z'), ttlMs: 1000 })
    const revoked = createSession(db)
    revokeSession(db, revoked.id)

    const removed = purgeExpiredSessions(db)
    expect(removed).toBe(2)
    expect(findActiveSession(db, live.token)?.id).toBe(live.id)
    expect(db.prepare('SELECT COUNT(*) c FROM sessions').get()).toMatchObject({ c: 1 })
    // reference the expired handle so the linter keeps it meaningful
    expect(expired.id).not.toBe(live.id)
  })
})
