import { openCoreDb } from '../db.js'
import { prepareDatabases } from '../migrations.js'
import { revokeAllSessions } from './sessions.js'
import { deleteAllChallenges } from './challenges.js'

export interface ResetInvalidationResult {
  sessionsRevoked: number
  challengesDeleted: number
}

/**
 * Invalidate all live auth state when owner credentials are reset: revoke every
 * session and drop every pending challenge (phase-002: existing sessions are
 * invalidated on reset). Ensures the core DB exists/migrated first so this is
 * safe to call from the host reset script before the app has ever started.
 */
export function invalidateSessionsAndChallenges (dataDir: string, now: Date = new Date()): ResetInvalidationResult {
  prepareDatabases(dataDir)
  const db = openCoreDb(dataDir)
  try {
    return {
      sessionsRevoked: revokeAllSessions(db, now),
      challengesDeleted: deleteAllChallenges(db),
    }
  } finally {
    db.close()
  }
}
