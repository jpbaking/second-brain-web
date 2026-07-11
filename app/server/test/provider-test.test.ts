import { createServer } from 'node:http'
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
import { testProvider } from '../src/providers/test.js'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []
const servers: Server[] = []

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  const c = list.find(x => x.startsWith(`${name}=`))
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

/** A stub that speaks the OpenAI /models shape, guarded by a fixed Bearer key. */
async function stubProvider (validKey: string): Promise<string> {
  const server = createServer((req, res) => {
    if (req.url === '/models') {
      const auth = req.headers.authorization
      if (auth === `Bearer ${validKey}`) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: [] }))
        return
      }
      res.writeHead(401).end('unauthorized')
      return
    }
    res.writeHead(404).end('not found')
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

/** A stub for Gemini's model-list endpoint and x-goog-api-key authentication. */
async function stubGeminiProvider (validKey: string): Promise<string> {
  const server = createServer((req, res) => {
    if (req.url === '/v1beta/models') {
      if (req.headers['x-goog-api-key'] === validKey && req.headers.authorization === undefined) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ models: [] }))
        return
      }
      res.writeHead(403).end('forbidden')
      return
    }
    res.writeHead(404).end('not found')
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

async function authedApp (secretsKey: string): Promise<{ app: FastifyInstance, cookie: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-provtest-'))
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
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}` }
}

async function createProfile (
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>
): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/providers', headers: { cookie }, payload })
  return res.json().id
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const server of servers.splice(0)) await new Promise<void>(resolve => server.close(() => resolve()))
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('testProvider (unit)', () => {
  it('reports ok when the endpoint accepts the key', async () => {
    const key = 'sk-good-key'
    const base = await stubProvider(key)
    const result = await testProvider({ providerId: 'openai-compatible', baseUrl: base, modelId: 'm', apiKey: key })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
  })

  it('reports unauthorised for a bad key without leaking it', async () => {
    const base = await stubProvider('sk-good-key')
    const badKey = 'sk-bad-key-secret'
    const result = await testProvider({ providerId: 'openai-compatible', baseUrl: base, modelId: 'm', apiKey: badKey })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(401)
    expect(result.message).not.toContain(badKey)
  })

  it('reports unreachable when the endpoint is down', async () => {
    // Nothing is listening on this port.
    const result = await testProvider(
      { providerId: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', modelId: 'm', apiKey: 'sk-x' },
      500
    )
    expect(result.ok).toBe(false)
    expect(result.status).toBe(null)
    expect(result.message).not.toContain('sk-x')
  })

  it('tests Gemini through v1beta/models with x-goog-api-key', async () => {
    const key = 'gemini-test-key'
    const base = await stubGeminiProvider(key)
    const result = await testProvider({ providerId: 'gemini', baseUrl: base, modelId: 'gemini-2.5-pro', apiKey: key })
    expect(result).toMatchObject({ ok: true, status: 200 })
  })

  it('reports a rejected Gemini key without leaking it', async () => {
    const base = await stubGeminiProvider('right-key')
    const badKey = 'wrong-gemini-secret'
    const result = await testProvider({ providerId: 'gemini', baseUrl: base, modelId: 'gemini-2.5-pro', apiKey: badKey })
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(result.message).not.toContain(badKey)
  })
})

describe('POST /api/providers/:id/test', () => {
  it('requires authentication', async () => {
    const { app } = await authedApp('k')
    const res = await app.inject({ method: 'POST', url: '/api/providers/anything/test' })
    expect(res.statusCode).toBe(401)
  })

  it('404s for an unknown profile', async () => {
    const { app, cookie } = await authedApp('k')
    const res = await app.inject({ method: 'POST', url: '/api/providers/nope/test', headers: { cookie } })
    expect(res.statusCode).toBe(404)
  })

  it('tests a stored profile with its decrypted key and never echoes the key', async () => {
    const { app, cookie } = await authedApp('secret-key')
    const key = 'sk-live-3333'
    const base = await stubProvider(key)
    const id = await createProfile(app, cookie, {
      displayName: 'Local', providerId: 'openai-compatible', modelId: 'm', baseUrl: base, apiKey: key,
    })

    const res = await app.inject({ method: 'POST', url: `/api/providers/${id}/test`, headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(key)
    expect(res.json()).toMatchObject({ ok: true, status: 200 })
  })

  it('reports a clear failure for a bad stored key', async () => {
    const { app, cookie } = await authedApp('secret-key')
    const base = await stubProvider('sk-the-real-one')
    const id = await createProfile(app, cookie, {
      displayName: 'Local', providerId: 'openai-compatible', modelId: 'm', baseUrl: base, apiKey: 'sk-wrong-one',
    })

    const res = await app.inject({ method: 'POST', url: `/api/providers/${id}/test`, headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(false)
    expect(res.json().status).toBe(401)
  })
})
