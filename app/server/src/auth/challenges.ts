import { randomBytes, randomUUID } from 'node:crypto'
import { hashSessionToken } from './sessions.js'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Short-lived pending challenges bridge the two login steps: the password step
 * issues one, the TOTP step consumes it (phase-002 Login Flow). Only the hash
 * of the challenge token is stored; the raw token lives in a temporary cookie.
 */

/** Pending challenges are valid for five minutes. */
export const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000

export interface CreatedChallenge {
  token: string
  id: string
  expiresAt: string
}

export function createChallenge (
  db: DatabaseSync,
  opts: { now?: Date, ttlMs?: number } = {}
): CreatedChallenge {
  const now = opts.now ?? new Date()
  const ttlMs = opts.ttlMs ?? DEFAULT_CHALLENGE_TTL_MS
  const id = randomUUID()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString()

  db.prepare(`
    INSERT INTO pending_challenges (id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, hashSessionToken(token), now.toISOString(), expiresAt)

  return { token, id, expiresAt }
}

/** Return the challenge id for a valid, unexpired token, else undefined. */
export function findValidChallenge (
  db: DatabaseSync,
  token: string,
  now: Date = new Date()
): string | undefined {
  const row = db.prepare(`
    SELECT id FROM pending_challenges WHERE token_hash = ? AND expires_at > ?
  `).get(hashSessionToken(token), now.toISOString()) as { id: string } | undefined
  return row?.id
}

export function deleteChallenge (db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM pending_challenges WHERE id = ?').run(id)
}

/** Drop every pending challenge (used when owner auth is reset). */
export function deleteAllChallenges (db: DatabaseSync): number {
  const res = db.prepare('DELETE FROM pending_challenges').run()
  return Number(res.changes)
}

export function purgeExpiredChallenges (db: DatabaseSync, now: Date = new Date()): number {
  const res = db.prepare('DELETE FROM pending_challenges WHERE expires_at <= ?')
    .run(now.toISOString())
  return Number(res.changes)
}
