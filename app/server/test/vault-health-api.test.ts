import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { vaultWorkspacePath } from '../src/vault/config.js'
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

async function authedApp (): Promise<{ app: FastifyInstance, cookie: string, dataDir: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-healthapi-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') })
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

function seedHealthScript (dataDir: string): void {
  const scripts = path.join(vaultWorkspacePath(dataDir), 'scripts')
  mkdirSync(scripts, { recursive: true })
  writeFileSync(path.join(scripts, 'health.py'), 'print("# Health")\nprint("1 issue found")')
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('vault health API', () => {
  it('requires authentication', async () => {
    const { app } = await authedApp()
    expect((await app.inject({ method: 'POST', url: '/api/vault/health' })).statusCode).toBe(401)
  })

  it('runs the health check and records lastHealth on status', async () => {
    const { app, cookie, dataDir } = await authedApp()
    seedHealthScript(dataDir)

    const res = await app.inject({ method: 'POST', url: '/api/vault/health', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ available: true, issueCount: 1 })
    expect(body.sections).toContain('Health')

    const status = await app.inject({ method: 'GET', url: '/api/vault/status', headers: { cookie } })
    expect(status.json().lastHealth).not.toBeNull()
  })
})
