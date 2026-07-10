import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { acquireLock, heartbeatLock, readLock, releaseLock } from '../src/vault/lock.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []
function coreDb (): DatabaseSync {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-lock-'))
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

describe('vault lock', () => {
  it('acquires when free and reports the holder on a second attempt', () => {
    const db = coreDb()
    expect(readLock(db).held).toBe(false)

    const first = acquireLock(db, { sessionId: 's1', operation: 'ingest' })
    expect(first.acquired).toBe(true)
    expect(readLock(db).held).toBe(true)

    const second = acquireLock(db, { sessionId: 's2' })
    expect(second.acquired).toBe(false)
    expect(second.lock?.sessionId).toBe('s1')
  })

  it('releases the lock so it can be re-acquired', () => {
    const db = coreDb()
    const held = acquireLock(db)
    expect(releaseLock(db, held.lock!.lockId)).toBe(true)
    expect(readLock(db).held).toBe(false)
    expect(acquireLock(db).acquired).toBe(true)
  })

  it('heartbeat only succeeds for the current holder', () => {
    const db = coreDb()
    const held = acquireLock(db)
    expect(heartbeatLock(db, held.lock!.lockId)).toBe(true)
    expect(heartbeatLock(db, 'someone-else')).toBe(false)
  })

  it('treats a lock past the stale timeout as free/acquirable', () => {
    const db = coreDb()
    const t0 = new Date('2026-01-01T00:00:00Z')
    acquireLock(db, { now: t0, staleMs: 1000 })

    const later = new Date(t0.getTime() + 5000)
    expect(readLock(db, later, 1000).stale).toBe(true)
    expect(readLock(db, later, 1000).held).toBe(false)
    // A new acquire past the stale window succeeds and replaces the holder.
    expect(acquireLock(db, { now: later, staleMs: 1000, sessionId: 'fresh' }).acquired).toBe(true)
    expect(readLock(db, later, 1000).lock?.sessionId).toBe('fresh')
  })
})
