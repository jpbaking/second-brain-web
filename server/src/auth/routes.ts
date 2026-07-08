import { openCoreDb } from '../db.js'
import { isOwnerConfigured, readOwnerAuth, verifyOwnerPassword } from './owner.js'
import { verifyTotp } from './totp.js'
import {
  DEFAULT_CHALLENGE_TTL_MS,
  createChallenge,
  deleteChallenge,
  findValidChallenge,
} from './challenges.js'
import { DEFAULT_SESSION_TTL_MS, createSession, findActiveSession, revokeSession } from './sessions.js'
import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  challengeCookieOptions,
  clearCookieOptions,
  sessionCookieOptions,
} from './cookies.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

/**
 * Two-step login (phase-002 Login Flow): POST /api/auth/password verifies the
 * password and issues a short-lived challenge cookie; POST /api/auth/totp
 * verifies the code against that challenge, then creates a session.
 */
export function registerAuthRoutes (app: FastifyInstance, config: AppConfig): void {
  // Guarded probe the front end calls to check whether it is authenticated.
  app.get('/api/session', async (req) => {
    return { authenticated: true, sessionId: req.sessionId }
  })

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE]
    if (token !== undefined) {
      const db = openCoreDb(config.dataDir)
      try {
        const session = findActiveSession(db, token)
        if (session !== undefined) revokeSession(db, session.id)
      } finally {
        db.close()
      }
    }
    reply.clearCookie(SESSION_COOKIE, clearCookieOptions())
    return await reply.send({ ok: true })
  })

  app.post('/api/auth/password', async (req, reply) => {
    const body = req.body as { password?: unknown } | undefined
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!isOwnerConfigured(config.dataDir)) {
      return await reply.code(503).send({ error: 'auth not configured' })
    }
    if (!await verifyOwnerPassword(config.dataDir, password)) {
      return await reply.code(401).send({ error: 'invalid credentials' })
    }

    const db = openCoreDb(config.dataDir)
    try {
      const challenge = createChallenge(db)
      reply.setCookie(CHALLENGE_COOKIE, challenge.token, challengeCookieOptions(DEFAULT_CHALLENGE_TTL_MS / 1000))
    } finally {
      db.close()
    }
    return await reply.send({ challenge: true })
  })

  app.post('/api/auth/totp', async (req, reply) => {
    const body = req.body as { code?: unknown } | undefined
    const code = typeof body?.code === 'string' ? body.code : ''
    const challengeToken = req.cookies[CHALLENGE_COOKIE]

    const owner = readOwnerAuth(config.dataDir)
    if (owner === null) {
      return await reply.code(503).send({ error: 'auth not configured' })
    }
    if (challengeToken === undefined) {
      return await reply.code(401).send({ error: 'no pending challenge' })
    }

    const db = openCoreDb(config.dataDir)
    try {
      const challengeId = findValidChallenge(db, challengeToken)
      if (challengeId === undefined) {
        reply.clearCookie(CHALLENGE_COOKIE, clearCookieOptions())
        return await reply.code(401).send({ error: 'no pending challenge' })
      }

      const valid = verifyTotp(owner.totp.secretBase32, code, {
        digits: owner.totp.digits,
        period: owner.totp.period,
        algorithm: owner.totp.algorithm,
        skewSteps: 1,
      })
      if (!valid) {
        return await reply.code(401).send({ error: 'invalid code' })
      }

      // Success: consume the challenge and start a session.
      deleteChallenge(db, challengeId)
      const session = createSession(db, {
        userAgent: req.headers['user-agent'] ?? null,
        ip: req.ip,
      })
      reply.setCookie(SESSION_COOKIE, session.token, sessionCookieOptions(DEFAULT_SESSION_TTL_MS / 1000))
      reply.clearCookie(CHALLENGE_COOKIE, clearCookieOptions())
      return await reply.send({ authenticated: true })
    } finally {
      db.close()
    }
  })
}
