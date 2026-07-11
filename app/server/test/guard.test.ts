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

async function loginSession (app: FastifyInstance, password: string, secret: string, digits: number, period: number): Promise<string> {
  const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(secret, { digits, period })
  const totp = await app.inject({
    method: 'POST',
    url: '/api/auth/totp',
    headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` },
    payload: { code },
  })
  const token = cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)
  if (token === undefined) throw new Error('login did not set a session cookie')
  return token
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function fixture (): Promise<{ app: FastifyInstance, password: string, secret: string, digits: number, period: number }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-guard-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'test-owner-key' })
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
  const app = buildApp(config)
  apps.push(app)
  return { app, password, secret: state.totp.secretBase32, digits: state.totp.digits, period: state.totp.period }
}

describe('auth guard', () => {
  it('rejects a private route without a session cookie', async () => {
    const { app } = await fixture()
    const res = await app.inject({ method: 'GET', url: '/api/session' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'authentication required' })
  })

  it('rejects a private route with an invalid session cookie', async () => {
    const { app } = await fixture()
    const res = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { cookie: `${SESSION_COOKIE}=not-a-real-token` },
    })
    expect(res.statusCode).toBe(401)
  })

  it('allows a private route with a valid session cookie', async () => {
    const { app, password, secret, digits, period } = await fixture()
    const token = await loginSession(app, password, secret, digits, period)
    const res = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ authenticated: true })
  })

  it('keeps public routes reachable without auth', async () => {
    const { app } = await fixture()
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/status' })).statusCode).toBe(200)
  })

  it('sets a hardened session cookie on login', async () => {
    const { app, password, secret, digits, period } = await fixture()
    const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
    const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
    const code = totpCode(secret, { digits, period })
    const totp = await app.inject({
      method: 'POST',
      url: '/api/auth/totp',
      headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` },
      payload: { code },
    })
    const setCookie = firstSetCookie(totp.headers['set-cookie'], SESSION_COOKIE)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toMatch(/Path=\//i)
    expect(setCookie).toMatch(/Max-Age=/i)
  })
})
