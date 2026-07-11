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

const scratch: string[] = []
const apps: FastifyInstance[] = []

function firstSetCookie (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  return list.find(c => c.startsWith(`${name}=`))
}
function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const c = firstSetCookie(h, name)
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function loggedInApp (): Promise<{ app: FastifyInstance, token: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-logout-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'test-owner-key' })
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
  const app = buildApp(config)
  apps.push(app)

  const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({
    method: 'POST',
    url: '/api/auth/totp',
    headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` },
    payload: { code },
  })
  const token = cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)
  if (token === undefined) throw new Error('login failed')
  return { app, token }
}

describe('logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const { app, token } = await loggedInApp()
    const cookie = `${SESSION_COOKIE}=${token}`

    // Authenticated before logout.
    expect((await app.inject({ method: 'GET', url: '/api/session', headers: { cookie } })).statusCode).toBe(200)

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
    expect(out.statusCode).toBe(200)
    const cleared = firstSetCookie(out.headers['set-cookie'], SESSION_COOKIE)
    expect(cleared).toMatch(/^sbw_session=;/)
    expect(cleared).toMatch(/Expires=.*1970/i)

    // The old token no longer authenticates.
    expect((await app.inject({ method: 'GET', url: '/api/session', headers: { cookie } })).statusCode).toBe(401)
  })

  it('is a no-op that still succeeds without a session cookie', async () => {
    const { app } = await loggedInApp()
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout' })
    expect(out.statusCode).toBe(200)
    expect(out.json()).toMatchObject({ ok: true })
  })
})
