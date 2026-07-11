import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { runGit } from '../src/vault/git.js'
import { vaultWorkspacePath } from '../src/vault/config.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []
const GIT_ID = ['-c', 'user.email=t@example.com', '-c', 'user.name=Test']

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  const c = list.find(x => x.startsWith(`${name}=`))
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

async function authedApp (): Promise<{ app: FastifyInstance, cookie: string, dataDir: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-cc-'))
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
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`, dataDir: config.dataDir }
}

async function seedWorkspace (dataDir: string): Promise<void> {
  const ws = vaultWorkspacePath(dataDir)
  mkdirSync(ws, { recursive: true })
  await runGit(['init', '-b', 'main'], { cwd: ws })
  writeFileSync(path.join(ws, 'README.md'), '# vault\n')
  mkdirSync(path.join(ws, 'inbox'), { recursive: true })
  writeFileSync(path.join(ws, 'inbox', 'a.txt'), 'a')
  writeFileSync(path.join(ws, 'inbox', 'b.txt'), 'b')
  mkdirSync(path.join(ws, 'reports', '2026'), { recursive: true })
  writeFileSync(path.join(ws, 'reports', '2026', 'weekly.md'), '# report')
  await runGit(['add', '.'], { cwd: ws })
  await runGit([...GIT_ID, 'commit', '-m', 'seed'], { cwd: ws })
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('command center API', () => {
  it('requires authentication', async () => {
    const { app } = await authedApp()
    expect((await app.inject({ method: 'GET', url: '/api/command-center' })).statusCode).toBe(401)
  })

  it('aggregates git status, lock, inbox backlog, and recent reports', async () => {
    const { app, cookie, dataDir } = await authedApp()
    await seedWorkspace(dataDir)

    const res = await app.inject({ method: 'GET', url: '/api/command-center', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.git).toMatchObject({ isRepo: true, branch: 'main', dirty: false })
    expect(body.git.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(body.lock.held).toBe(false)
    expect(body.inboxBacklog).toBe(2)
    expect(body.recentReports).toHaveLength(1)
    expect(body.recentReports[0]).toMatchObject({ path: '2026/weekly.md', title: 'report', type: 'markdown', year: 2026 })
    expect(body.reminders).toEqual([])
    expect(body.commitments).toEqual([])
    expect(body.health).toBeNull()
  })
})
