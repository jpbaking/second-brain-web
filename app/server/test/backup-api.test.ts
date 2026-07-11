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

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('backup API', () => {
  it('requires authentication', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-backup-'))
    scratch.push(root)
    const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'k' })
    const app = buildApp(config)
    apps.push(app)

    expect((await app.inject({ method: 'GET', url: '/api/backup/core' })).statusCode).toBe(401)
  })

  it('downloads the core database', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-backup-'))
    scratch.push(root)
    const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'k' })
    prepareDatabases(config.dataDir)
    const { password, state } = await generateOwnerAuth()
    writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
    
    const app = buildApp(config)
    apps.push(app)

    const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
    const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
    const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
    const totp = await app.inject({ method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code } })
    const cookie = `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`

    const res = await app.inject({ method: 'GET', url: '/api/backup/core', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/x-sqlite3')
    expect(res.headers['content-disposition']).toBe('attachment; filename="app-core.db"')
    expect(res.rawPayload.length).toBeGreaterThan(100)
    expect(res.rawPayload.toString('utf8', 0, 15)).toBe('SQLite format 3')
  })
})
