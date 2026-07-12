import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const scratch: string[] = []
const apps: FastifyInstance[] = []

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  const c = list.find(x => x.startsWith(`${name}=`))
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

async function authedApp (): Promise<{ app: FastifyInstance, cookie: string, dataDir: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-profapi-'))
  scratch.push(root)
  const env: NodeJS.ProcessEnv = {
    SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'),
    SECOND_BRAIN_WEB_SECRETS_KEY: 'test-key',
  }
  const config = loadConfig(env)
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
  const app = buildApp(config)
  apps.push(app)
  await app.ready()

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

describe('profile API', () => {
  it('GET /api/profile returns empty profile initially', async () => {
    const { app, cookie } = await authedApp()
    const res = await app.inject({ method: 'GET', url: '/api/profile', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({})
  })

  it('PUT /api/profile updates profile and returns updated', async () => {
    const { app, cookie } = await authedApp()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: { cookie },
      payload: { timezone: 'Europe/London' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ timezone: 'Europe/London' })

    const getRes = await app.inject({ method: 'GET', url: '/api/profile', headers: { cookie } })
    expect(getRes.json()).toEqual({ timezone: 'Europe/London' })
  })

  it('round-trips new-chat composer defaults (m51)', async () => {
    const { app, cookie } = await authedApp()
    const chatDefaults = { providerProfileId: 'p2', approvalPreset: 'high-trust', thinking: true, reasoningEffort: 'medium' }
    const put = await app.inject({ method: 'PUT', url: '/api/profile', headers: { cookie }, payload: { chatDefaults } })
    expect(put.statusCode).toBe(200)
    expect(put.json().chatDefaults).toEqual(chatDefaults)

    const got = await app.inject({ method: 'GET', url: '/api/profile', headers: { cookie } })
    expect(got.json().chatDefaults).toEqual(chatDefaults)
  })
})
