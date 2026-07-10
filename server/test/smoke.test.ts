import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import type { FastifyInstance } from 'fastify'

/**
 * Minimal end-to-end smoke test (milestone 12). Boots the whole app and walks
 * the critical path a deployment must satisfy on a cold start: the health probe
 * answers, guarded routes are closed by default, the full password + TOTP login
 * handshake issues a session, and that session opens an authenticated route.
 */

const scratch: string[] = []
const apps: FastifyInstance[] = []

function cookieValue (header: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header]
  return values.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0]
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('smoke', () => {
  it('boots and serves health, auth, and a guarded route end-to-end', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-smoke-'))
    scratch.push(root)
    const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') })
    prepareDatabases(config.dataDir)
    const { password, state } = await generateOwnerAuth()
    writeOwnerAuth(config.dataDir, state)
    const app = buildApp(config)
    apps.push(app)

    // 1. Health probe answers without auth.
    const health = await app.inject({ method: 'GET', url: '/api/health' })
    expect(health.statusCode).toBe(200)
    expect(health.json()).toEqual({ status: 'ok' })

    // 2. A guarded route is closed by default.
    expect((await app.inject({ method: 'GET', url: '/api/vault/config' })).statusCode).toBe(401)

    // 3. Full login handshake: password -> challenge, then TOTP -> session.
    const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
    expect(pw.statusCode).toBe(200)
    const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
    expect(challenge).toBeTruthy()

    const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
    const totp = await app.inject({ method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code } })
    expect(totp.statusCode).toBe(200)
    const session = cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)
    expect(session).toBeTruthy()

    // 4. The session opens the guarded route.
    const guarded = await app.inject({ method: 'GET', url: '/api/vault/config', headers: { cookie: `${SESSION_COOKIE}=${session}` } })
    expect(guarded.statusCode).toBe(200)
  })
})
