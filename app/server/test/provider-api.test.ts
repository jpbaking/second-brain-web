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
import { openCoreDb } from '../src/db.js'
import { createProfile } from '../src/providers/store.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  const c = list.find(x => x.startsWith(`${name}=`))
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

async function authedApp (secretsKey: string): Promise<{ app: FastifyInstance, cookie: string, dataDir: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-provapi-'))
  scratch.push(root)
  const env: NodeJS.ProcessEnv = {
    SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'),
    SECOND_BRAIN_WEB_SECRETS_KEY: secretsKey,
  }
  const config = loadConfig(env)
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
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`, dataDir: config.dataDir }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('provider API', () => {
  it('requires authentication', async () => {
    const { app } = await authedApp('k')
    expect((await app.inject({ method: 'GET', url: '/api/providers' })).statusCode).toBe(401)
  })

  it('lists key status without ciphertext or legacy last-four metadata', async () => {
    const { app, cookie, dataDir } = await authedApp('secret-key')
    const db = openCoreDb(dataDir)
    createProfile(db, { displayName: 'GPT', providerId: 'openai', modelId: 'gpt-5', keyCiphertext: 'v1:opaque' })
    db.close()
    const list = await app.inject({ method: 'GET', url: '/api/providers', headers: { cookie } })
    expect(list.statusCode).toBe(200)
    expect(list.json().profiles[0]).toMatchObject({ displayName: 'GPT', key: 'configured' })
    expect(list.body).not.toContain('keyLast4')
    expect(list.body).not.toContain('hasKey')
  })

  it('does not expose provider mutation routes', async () => {
    const { app, cookie } = await authedApp('k')
    expect((await app.inject({ method: 'POST', url: '/api/providers', headers: { cookie }, payload: {} })).statusCode).toBe(404)
    expect((await app.inject({ method: 'PUT', url: '/api/providers/profile', headers: { cookie }, payload: {} })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: '/api/providers/profile', headers: { cookie } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/api/providers/profile/default', headers: { cookie } })).statusCode).toBe(404)
  })
})
