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

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  const c = list.find(x => x.startsWith(`${name}=`))
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

async function authedApp (secretsKey?: string): Promise<{ app: FastifyInstance, cookie: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-provapi-'))
  scratch.push(root)
  const env: NodeJS.ProcessEnv = { SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }
  if (secretsKey !== undefined) env.SECOND_BRAIN_WEB_SECRETS_KEY = secretsKey
  const config = loadConfig(env)
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state)
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
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}` }
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

  it('creates a profile, masks the key, and never returns key material', async () => {
    const { app, cookie } = await authedApp('secret-key')
    const key = 'sk-openai-supersecret-9999'
    const res = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { cookie },
      payload: { displayName: 'GPT', providerId: 'openai', modelId: 'gpt-5', apiKey: key },
    })
    expect(res.statusCode).toBe(201)
    expect(res.body).not.toContain(key)
    expect(res.json()).toMatchObject({ providerId: 'openai', hasKey: true, keyLast4: '9999' })

    const list = await app.inject({ method: 'GET', url: '/api/providers', headers: { cookie } })
    expect(list.body).not.toContain(key)
    expect(list.json().profiles).toHaveLength(1)
    expect(list.json().secretStorage).toBe(true)
  })

  it('refuses to store a key when SECOND_BRAIN_WEB_SECRETS_KEY is unset', async () => {
    const { app, cookie } = await authedApp() // no secrets key
    const res = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { cookie },
      payload: { displayName: 'X', providerId: 'openai', modelId: 'm', apiKey: 'sk-abc' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/SECOND_BRAIN_WEB_SECRETS_KEY/)
  })

  it('rejects an unknown provider and a bad base URL', async () => {
    const { app, cookie } = await authedApp('k')
    const bad = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { cookie },
      payload: { displayName: 'X', providerId: 'gemini', modelId: 'm' },
    })
    expect(bad.statusCode).toBe(400)
    const badUrl = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { cookie },
      payload: { displayName: 'X', providerId: 'openai-compatible', modelId: 'm', baseUrl: 'not-a-url' },
    })
    expect(badUrl.statusCode).toBe(400)
  })

  it('sets a default and deletes a profile', async () => {
    const { app, cookie } = await authedApp('k')
    const created = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { cookie },
      payload: { displayName: 'A', providerId: 'anthropic', modelId: 'claude-sonnet-5' },
    })
    const id = created.json().id

    const def = await app.inject({ method: 'POST', url: `/api/providers/${id}/default`, headers: { cookie } })
    expect(def.statusCode).toBe(200)
    expect(def.json().isDefault).toBe(true)

    const del = await app.inject({ method: 'DELETE', url: `/api/providers/${id}`, headers: { cookie } })
    expect(del.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/providers', headers: { cookie } })).json().profiles).toHaveLength(0)
  })
})
