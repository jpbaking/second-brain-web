import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Server-side session store (phase-002 Sessions). The browser holds an opaque
 * token in a cookie; only its SHA-256 hash is stored here, so a database leak
 * does not yield usable session tokens. Functions operate on an already-open
 * core database connection (see db.ts / openCoreDb).
 */

/** Default session lifetime — 24h, the top of phase-002's 12–24h range. */
export const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000

export interface SessionRow {
  id: string
  tokenHash: string
  createdAt: string
  lastUsedAt: string
  expiresAt: string
  userAgent: string | null
  ip: string | null
  revokedAt: string | null
}

export interface CreateSessionOptions {
  now?: Date
  ttlMs?: number
  userAgent?: string | null
  ip?: string | null
}

export interface CreatedSession {
  /** Opaque token for the cookie — returned once, never stored in the clear. */
  token: string
  id: string
  expiresAt: string
}

/** Hash a session token for storage/lookup. */
export function hashSessionToken (token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function generateToken (): string {
  return randomBytes(32).toString('base64url')
}

/** Create a session and return the opaque cookie token (stored hashed). */
export function createSession (db: DatabaseSync, opts: CreateSessionOptions = {}): CreatedSession {
  const now = opts.now ?? new Date()
  const ttlMs = opts.ttlMs ?? DEFAULT_SESSION_TTL_MS
  const id = randomUUID()
  const token = generateToken()
  const createdAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString()

  db.prepare(`
    INSERT INTO sessions
      (id, token_hash, created_at, last_used_at, expires_at, user_agent, ip, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    id,
    hashSessionToken(token),
    createdAt,
    createdAt,
    expiresAt,
    opts.userAgent ?? null,
    opts.ip ?? null
  )

  return { token, id, expiresAt }
}

function mapRow (row: Record<string, unknown>): SessionRow {
  return {
    id: row.id as string,
    tokenHash: row.token_hash as string,
    createdAt: row.created_at as string,
    lastUsedAt: row.last_used_at as string,
    expiresAt: row.expires_at as string,
    userAgent: (row.user_agent as string | null) ?? null,
    ip: (row.ip as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  }
}

/**
 * Look up an active (not revoked, not expired) session by its token. ISO-8601
 * UTC timestamps compare correctly as text.
 */
export function findActiveSession (db: DatabaseSync, token: string, now: Date = new Date()): SessionRow | undefined {
  const row = db.prepare(`
    SELECT * FROM sessions
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
  `).get(hashSessionToken(token), now.toISOString()) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}

/** Record that a session was just used (audit + idle tracking). */
export function touchSession (db: DatabaseSync, id: string, now: Date = new Date()): void {
  db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(now.toISOString(), id)
}

/** Revoke a single session. */
export function revokeSession (db: DatabaseSync, id: string, now: Date = new Date()): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(now.toISOString(), id)
}

/** Revoke every currently-active session (used when owner auth is reset). */
export function revokeAllSessions (db: DatabaseSync, now: Date = new Date()): number {
  const res = db.prepare('UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL')
    .run(now.toISOString())
  return Number(res.changes)
}

/** Delete sessions that are expired or were revoked (housekeeping). */
export function purgeExpiredSessions (db: DatabaseSync, now: Date = new Date()): number {
  const res = db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL')
    .run(now.toISOString())
  return Number(res.changes)
}
