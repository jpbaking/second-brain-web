import { openCoreDb } from '../db.js'
import { findActiveSession, touchSession } from './sessions.js'
import { SESSION_COOKIE } from './cookies.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the auth guard on authenticated requests. */
    sessionId: string | null
  }
}

/**
 * Public API paths that never require a session. Everything else under /api/ is
 * guarded (secure by default); non-API paths are the static front end / SPA and
 * are always served so the login page can load.
 */
function isPublicPath (url: string): boolean {
  const pathOnly = url.split('?')[0] ?? ''
  if (!pathOnly.startsWith('/api/')) return true
  if (pathOnly === '/api/health' || pathOnly === '/api/status') return true
  if (pathOnly.startsWith('/api/auth/')) return true
  return false
}

/** Install a global session guard in front of every private route. */
export function registerAuthGuard (app: FastifyInstance, config: AppConfig): void {
  app.decorateRequest('sessionId', null)

  app.addHook('onRequest', async (req: FastifyRequest, reply) => {
    if (isPublicPath(req.raw.url ?? '')) return

    const token = req.cookies[SESSION_COOKIE]
    if (token === undefined) {
      return await reply.code(401).send({ error: 'authentication required' })
    }

    const db = openCoreDb(config.dataDir)
    try {
      const session = findActiveSession(db, token)
      if (session === undefined) {
        return await reply.code(401).send({ error: 'authentication required' })
      }
      touchSession(db, session.id)
      req.sessionId = session.id
    } finally {
      db.close()
    }
  })
}
