import type { DatabaseSync } from 'node:sqlite'

/**
 * Login rate limiting (phase-002 Rate Limiting). Failure counters are kept per
 * IP and per account in SQLite. After a threshold of consecutive failures the
 * key is locked for an exponentially growing but capped delay — fail closed,
 * but never a permanent lockout (the host reset script is the recovery path).
 * Only metadata (a key and a count) is stored; never passwords or codes.
 */

export interface ThrottlePolicy {
  /** Consecutive failures before locking starts. */
  threshold: number
  /** Lock duration for the first over-threshold failure. */
  baseLockMs: number
  /** Cap so a lock is never permanent. */
  maxLockMs: number
}

export const DEFAULT_THROTTLE_POLICY: ThrottlePolicy = {
  threshold: 5,
  baseLockMs: 2000,
  maxLockMs: 15 * 60 * 1000,
}

export interface ThrottleStatus {
  locked: boolean
  retryAfterMs: number
}

/** Rate-limit keys for a request: the client IP and the single owner account. */
export function throttleKeys (ip: string): string[] {
  return [`ip:${ip}`, 'account:owner']
}

/** Report whether any key is currently locked, and for how much longer. */
export function checkThrottle (db: DatabaseSync, keys: string[], now: Date = new Date()): ThrottleStatus {
  let retryAfterMs = 0
  for (const key of keys) {
    const row = db.prepare('SELECT locked_until FROM login_throttle WHERE key = ?')
      .get(key) as { locked_until: string | null } | undefined
    if (row?.locked_until != null) {
      const remaining = new Date(row.locked_until).getTime() - now.getTime()
      if (remaining > retryAfterMs) retryAfterMs = remaining
    }
  }
  return { locked: retryAfterMs > 0, retryAfterMs }
}

/** Record one failed attempt against each key, locking once over threshold. */
export function recordFailure (
  db: DatabaseSync,
  keys: string[],
  now: Date = new Date(),
  policy: ThrottlePolicy = DEFAULT_THROTTLE_POLICY
): void {
  for (const key of keys) {
    const row = db.prepare('SELECT fail_count FROM login_throttle WHERE key = ?')
      .get(key) as { fail_count: number } | undefined
    const failCount = (row?.fail_count ?? 0) + 1

    let lockedUntil: string | null = null
    if (failCount >= policy.threshold) {
      const lockMs = Math.min(policy.maxLockMs, policy.baseLockMs * 2 ** (failCount - policy.threshold))
      lockedUntil = new Date(now.getTime() + lockMs).toISOString()
    }

    db.prepare(`
      INSERT INTO login_throttle (key, fail_count, locked_until, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        fail_count = excluded.fail_count,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at
    `).run(key, failCount, lockedUntil, now.toISOString())
  }
}

/** Clear counters for these keys after a successful step. */
export function clearFailures (db: DatabaseSync, keys: string[]): void {
  for (const key of keys) {
    db.prepare('DELETE FROM login_throttle WHERE key = ?').run(key)
  }
}
