import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import { runGit } from '../src/vault/git.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []
const GIT_ID = ['-c', 'user.email=t@example.com', '-c', 'user.name=Test']

async function seedRemote (branch: string): Promise<string> {
  const base = mkdtempSync(path.join(tmpdir(), 'sbw-vaultapi-remote-'))
  scratch.push(base)
  const src = path.join(base, 'src')
  mkdirSync(src)
  await runGit(['init', '-b', branch], { cwd: src })
  writeFileSync(path.join(src, 'README.md'), '# vault\n')
  await runGit(['add', '.'], { cwd: src })
  await runGit([...GIT_ID, 'commit', '-m', 'initial'], { cwd: src })
  const bare = path.join(base, 'remote.git')
  await runGit(['clone', '--bare', src, bare])
  return bare
}

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  const c = list.find(x => x.startsWith(`${name}=`))
  const m = c === undefined ? null : new RegExp(`^${name}=([^;]*)`).exec(c)
  return m && m[1] !== '' ? decodeURIComponent(m[1]) : undefined
}

async function authedApp (): Promise<{ app: FastifyInstance, cookie: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-vaultapi-'))
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
  const token = cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)
  return { app, cookie: `${SESSION_COOKIE}=${token}` }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('vault config API', () => {
  it('requires authentication', async () => {
    const { app } = await authedApp()
    expect((await app.inject({ method: 'GET', url: '/api/vault/config' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'PUT', url: '/api/vault/config', payload: {} })).statusCode).toBe(401)
  })

  it('returns the config (paths only, no key contents) when authed', async () => {
    const { app, cookie } = await authedApp()
    const res = await app.inject({ method: 'GET', url: '/api/vault/config', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ vaultId: 'default', branch: 'main', remoteUrl: null })
    expect(body.sshKeyPath).toMatch(/ssh\/deploy_key$/)
    expect(res.body).not.toContain('PRIVATE KEY')
  })

  it('persists a valid remote URL, branch, and display name', async () => {
    const { app, cookie } = await authedApp()
    const remoteUrl = await seedRemote('work')
    const put = await app.inject({
      method: 'PUT',
      url: '/api/vault/config',
      headers: { cookie },
      payload: { remoteUrl, branch: 'work', displayName: 'Vault' },
    })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toMatchObject({ remoteUrl, branch: 'work', displayName: 'Vault' })

    const get = await app.inject({ method: 'GET', url: '/api/vault/config', headers: { cookie } })
    expect(get.json()).toMatchObject({ remoteUrl, branch: 'work' })
  })

  it('rejects an invalid remote URL and an invalid branch', async () => {
    const { app, cookie } = await authedApp()
    const badUrl = await app.inject({
      method: 'PUT',
      url: '/api/vault/config',
      headers: { cookie },
      payload: { remoteUrl: 'not a url' },
    })
    expect(badUrl.statusCode).toBe(400)

    const badBranch = await app.inject({
      method: 'PUT',
      url: '/api/vault/config',
      headers: { cookie },
      payload: { branch: 'bad branch' },
    })
    expect(badBranch.statusCode).toBe(400)
  })
})
