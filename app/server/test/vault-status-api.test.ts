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
import { VAULT_MARKERS } from '../src/vault/detect.js'
import { openCoreDb } from '../src/db.js'
import { acquireLock } from '../src/vault/lock.js'
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

/** A bare remote seeded as a complete vault (all marker files). */
async function seedFullVault (): Promise<string> {
  const base = mkdtempSync(path.join(tmpdir(), 'sbw-vault-remote-'))
  scratch.push(base)
  const src = path.join(base, 'src')
  mkdirSync(src)
  await runGit(['init', '-b', 'main'], { cwd: src })
  for (const marker of VAULT_MARKERS) {
    const file = path.join(src, marker)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, 'x')
  }
  await runGit(['add', '.'], { cwd: src })
  await runGit([...GIT_ID, 'commit', '-m', 'seed'], { cwd: src })
  const bare = path.join(base, 'remote.git')
  await runGit(['clone', '--bare', src, bare])
  return bare
}

async function authedApp (): Promise<{ app: FastifyInstance, cookie: string, workspace: string, dataDir: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-vaultstatus-'))
  scratch.push(root)
  const dataDir = path.join(root, 'data')
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: dataDir, SECOND_BRAIN_WEB_SECRETS_KEY: 'test-owner-key' })
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
  // @ts-expect-error test util
  const workspace = vaultWorkspacePath(config.dataDir)
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`, workspace, dataDir: config.dataDir }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('vault status API', () => {
  it('requires authentication', async () => {
    const { app } = await authedApp()
    expect((await app.inject({ method: 'GET', url: '/api/vault/status' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/api/vault/sync' })).statusCode).toBe(401)
  })

  it('reports unconfigured, un-cloned status initially', async () => {
    const { app, cookie } = await authedApp()
    const res = await app.inject({ method: 'GET', url: '/api/vault/status', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ configured: false, cloned: false, branch: 'main', commit: null })
  })

  it('syncs a configured remote and then reports branch, commit, and detection', async () => {
    const bare = await seedFullVault()
    const { app, cookie } = await authedApp()

    await app.inject({
      method: 'PUT',
      url: '/api/vault/config',
      headers: { cookie },
      payload: { remoteUrl: bare, branch: 'main' },
    })

    const sync = await app.inject({ method: 'POST', url: '/api/vault/sync', headers: { cookie } })
    expect(sync.statusCode).toBe(200)
    expect(sync.json()).toMatchObject({ state: 'ready' })
    expect(sync.json().commit).toMatch(/^[0-9a-f]{40}$/)

    const status = await app.inject({ method: 'GET', url: '/api/vault/status', headers: { cookie } })
    const body = status.json()
    expect(body).toMatchObject({ configured: true, cloned: true, branch: 'main' })
    expect(body.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(body.detection.present).toBe(true)
  })

  it('aggregates git status and health check in /api/vault/review', async () => {
    const bare = await seedFullVault()
    const { app, cookie } = await authedApp()

    await app.inject({
      method: 'PUT',
      url: '/api/vault/config',
      headers: { cookie },
      payload: { remoteUrl: bare, branch: 'main' },
    })
    await app.inject({ method: 'POST', url: '/api/vault/sync', headers: { cookie } })

    const res = await app.inject({ method: 'GET', url: '/api/vault/review', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.git.isRepo).toBe(true)
    expect(body.git.branch).toBe('main')
    expect(body.health.available).toBe(false) // scripts/health.py isn't present in the bare vault
  })

  it('commits and pushes dirty state via /api/vault/commit', async () => {
    const bare = await seedFullVault()
    const { app, cookie, workspace } = await authedApp()

    await app.inject({
      method: 'PUT',
      url: '/api/vault/config',
      headers: { cookie },
      payload: { remoteUrl: bare, branch: 'main' },
    })
    await app.inject({ method: 'POST', url: '/api/vault/sync', headers: { cookie } })

    // Simulate dirty state
    writeFileSync(path.join(workspace, 'scripts', 'health.py'), 'print("All checks passed: 0 issues")\n')
    writeFileSync(path.join(workspace, 'dirty-file.txt'), 'dirty')
    const rev1 = await app.inject({ method: 'GET', url: '/api/vault/review', headers: { cookie } })
    expect(rev1.json().git.dirty).toBe(true)

    const commitRes = await app.inject({ method: 'POST', url: '/api/vault/commit', headers: { cookie } })
    expect(commitRes.statusCode).toBe(200)
    expect(commitRes.json().success).toBe(true)

    const rev2 = await app.inject({ method: 'GET', url: '/api/vault/review', headers: { cookie } })
    expect(rev2.json().git.dirty).toBe(false)
  })

  it('refuses to commit while another session holds the vault write lock', async () => {
    const bare = await seedFullVault()
    const { app, cookie, workspace, dataDir } = await authedApp()

    await app.inject({
      method: 'PUT',
      url: '/api/vault/config',
      headers: { cookie },
      payload: { remoteUrl: bare, branch: 'main' },
    })
    await app.inject({ method: 'POST', url: '/api/vault/sync', headers: { cookie } })
    writeFileSync(path.join(workspace, 'dirty-file.txt'), 'dirty')

    // Simulate an agent session mid-write holding the single-writer lock.
    const db = openCoreDb(dataDir)
    const held = acquireLock(db, { sessionId: 'agent-1', operation: 'editor' })
    expect(held.acquired).toBe(true)
    db.close()

    const res = await app.inject({ method: 'POST', url: '/api/vault/commit', headers: { cookie } })
    expect(res.statusCode).toBe(400)
    expect(res.json().success).toBe(false)
    expect(res.json().message).toMatch(/lock/i)
  })
})
