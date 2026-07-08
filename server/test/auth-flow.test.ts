import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { SESSION_COOKIE, CHALLENGE_COOKIE } from '../src/auth/cookies.js'
import type { OwnerAuthState } from '../src/auth/bootstrap.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

interface Fixture { app: FastifyInstance, password: string, state: OwnerAuthState }

async function fixture (): Promise<Fixture> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-authflow-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') })
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state)
  const app = buildApp(config)
  apps.push(app)
  return { app, password, state }
}

/** Extract a cookie value from a set-cookie header list. */
function cookieValue (setCookie: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie === undefined ? [] : [setCookie]
  for (const c of list) {
    const m = new RegExp(`^${name}=([^;]*)`).exec(c)
    if (m && m[1] !== '') return decodeURIComponent(m[1])
  }
  return undefined
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('login flow', () => {
  it('password then TOTP yields a session cookie', async () => {
    const { app, password, state } = await fixture()

    const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
    expect(pw.statusCode).toBe(200)
    const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
    expect(challenge).toBeDefined()

    const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
    const totp = await app.inject({
      method: 'POST',
      url: '/api/auth/totp',
      headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` },
      payload: { code },
    })
    expect(totp.statusCode).toBe(200)
    expect(totp.json()).toEqual({ authenticated: true })
    expect(cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)).toBeDefined()
  })

  it('rejects a wrong password with 401 and no challenge', async () => {
    const { app, password } = await fixture()
    const res = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password: `${password}x` } })
    expect(res.statusCode).toBe(401)
    expect(cookieValue(res.headers['set-cookie'], CHALLENGE_COOKIE)).toBeUndefined()
  })

  it('rejects a wrong TOTP code with 401 and no session', async () => {
    const { app, password, state } = await fixture()
    const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
    const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
    const good = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
    const wrong = good === '000000' ? '111111' : '000000'
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/totp',
      headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` },
      payload: { code: wrong },
    })
    expect(res.statusCode).toBe(401)
    expect(cookieValue(res.headers['set-cookie'], SESSION_COOKIE)).toBeUndefined()
  })

  it('refuses TOTP without a valid challenge', async () => {
    const { app, state } = await fixture()
    const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
    const res = await app.inject({ method: 'POST', url: '/api/auth/totp', payload: { code } })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'no pending challenge' })
  })
})
