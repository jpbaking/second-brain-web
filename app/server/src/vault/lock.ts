import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Single-writer vault lock (phase-003 Single-Writer Lock). MVP allows many
 * chat sessions but only one active vault writer. A lock whose heartbeat has
 * gone stale (holder died) is treated as free so the app never wedges
 * permanently.
 */

export const LOCK_NAME = 'vault'
/** A lock with no heartbeat within this window is considered stale. */
export const DEFAULT_STALE_MS = 2 * 60 * 1000

export interface VaultLock {
  lockId: string
  sessionId: string | null
  operation: string | null
  startedAt: string
  lastHeartbeat: string
}

export interface LockState {
  held: boolean
  stale: boolean
  lock: VaultLock | null
}

export interface AcquireOptions {
  sessionId?: string | null
  operation?: string | null
  now?: Date
  staleMs?: number
}

export interface AcquireResult {
  acquired: boolean
  lock: VaultLock | null
}

interface LockRow {
  lock_id: string
  session_id: string | null
  operation: string | null
  started_at: string
  last_heartbeat: string
}

function mapRow (row: LockRow): VaultLock {
  return {
    lockId: row.lock_id,
    sessionId: row.session_id,
    operation: row.operation,
    startedAt: row.started_at,
    lastHeartbeat: row.last_heartbeat,
  }
}

function readRow (db: DatabaseSync): LockRow | undefined {
  return db.prepare('SELECT * FROM vault_lock WHERE name = ?').get(LOCK_NAME) as LockRow | undefined
}

function isStale (row: LockRow, now: Date, staleMs: number): boolean {
  return now.getTime() - new Date(row.last_heartbeat).getTime() > staleMs
}

/** Read the current lock state, accounting for staleness. */
export function readLock (db: DatabaseSync, now: Date = new Date(), staleMs: number = DEFAULT_STALE_MS): LockState {
  const row = readRow(db)
  if (row === undefined) return { held: false, stale: false, lock: null }
  const stale = isStale(row, now, staleMs)
  return { held: !stale, stale, lock: mapRow(row) }
}

/** Acquire the lock if it is free or stale; otherwise report the current holder. */
export function acquireLock (db: DatabaseSync, opts: AcquireOptions = {}): AcquireResult {
  const now = opts.now ?? new Date()
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS
  const existing = readRow(db)
  if (existing !== undefined && !isStale(existing, now, staleMs)) {
    return { acquired: false, lock: mapRow(existing) }
  }

  const iso = now.toISOString()
  const lock: VaultLock = {
    lockId: randomUUID(),
    sessionId: opts.sessionId ?? null,
    operation: opts.operation ?? null,
    startedAt: iso,
    lastHeartbeat: iso,
  }
  db.prepare(`
    INSERT INTO vault_lock (name, lock_id, session_id, operation, started_at, last_heartbeat)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      lock_id = excluded.lock_id,
      session_id = excluded.session_id,
      operation = excluded.operation,
      started_at = excluded.started_at,
      last_heartbeat = excluded.last_heartbeat
  `).run(LOCK_NAME, lock.lockId, lock.sessionId, lock.operation, lock.startedAt, lock.lastHeartbeat)
  return { acquired: true, lock }
}

/** Refresh the heartbeat for a held lock. Returns false if it is not the holder. */
export function heartbeatLock (db: DatabaseSync, lockId: string, now: Date = new Date()): boolean {
  const res = db.prepare('UPDATE vault_lock SET last_heartbeat = ? WHERE name = ? AND lock_id = ?')
    .run(now.toISOString(), LOCK_NAME, lockId)
  return Number(res.changes) > 0
}

/** Release the lock if held by this lockId. */
export function releaseLock (db: DatabaseSync, lockId: string): boolean {
  const res = db.prepare('DELETE FROM vault_lock WHERE name = ? AND lock_id = ?').run(LOCK_NAME, lockId)
  return Number(res.changes) > 0
}
