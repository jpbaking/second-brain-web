import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import { vaultWorkspacePath } from '../src/vault/config.js'
import { isSafeVaultPath, titleOf } from '../src/explorer/routes.js'
import type { ExplorerFile, ExplorerTree } from '../src/explorer/routes.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

function cookieValue (header: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header]
  return values.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0]
}

async function fixture (): Promise<{ app: FastifyInstance, cookie: string, ws: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-explorer-api-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'test-owner-key' })
  prepareDatabases(config.dataDir)
  const ws = vaultWorkspacePath(config.dataDir)
  const write = (rel: string, body: string | Buffer) => {
    const full = path.join(ws, ...rel.split('/'))
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  write('memory/notes/index.md', '# Index\n\nA hub note.\n')
  write('memory/notes/plain.txt', 'just text\n')
  write('memory/people/alice.md', '# Alice\n')
  write('library/blob.bin', Buffer.from([0x89, 0x50, 0x00, 0x47]))
  mkdirSync(path.join(ws, '.git'), { recursive: true })
  write('.git/config', 'never listed')

  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
  const app = buildApp(config)
  apps.push(app)
  const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({ method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code } })
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`, ws }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('explorer file-browser API', () => {
  it('requires authentication', async () => {
    const { app } = await fixture()
    expect((await app.inject({ method: 'GET', url: '/api/explorer/tree' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/explorer/file?path=memory/notes/index.md' })).statusCode).toBe(401)
  })

  it('lists the vault root with directories first and dotfiles hidden', async () => {
    const { app, cookie } = await fixture()
    const tree = (await app.inject({ method: 'GET', url: '/api/explorer/tree', headers: { cookie } })).json() as ExplorerTree
    expect(tree.path).toBe('')
    expect(tree.entries.map(e => e.name)).toEqual(['library', 'memory'])
    expect(tree.entries.every(e => e.kind === 'dir')).toBe(true)
  })

  it('lists a subdirectory with files after directories, with sizes', async () => {
    const { app, cookie } = await fixture()
    const tree = (await app.inject({ method: 'GET', url: '/api/explorer/tree?path=memory/notes', headers: { cookie } })).json() as ExplorerTree
    expect(tree.entries).toEqual([
      { name: 'index.md', path: 'memory/notes/index.md', kind: 'file', size: 21 },
      { name: 'plain.txt', path: 'memory/notes/plain.txt', kind: 'file', size: 10 },
    ])
  })

  it('404s a missing folder and a file path given to tree', async () => {
    const { app, cookie } = await fixture()
    expect((await app.inject({ method: 'GET', url: '/api/explorer/tree?path=nope', headers: { cookie } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/explorer/tree?path=memory/notes/index.md', headers: { cookie } })).statusCode).toBe(404)
  })

  it('serves a markdown file with title and content', async () => {
    const { app, cookie } = await fixture()
    const file = (await app.inject({ method: 'GET', url: '/api/explorer/file?path=memory/notes/index.md', headers: { cookie } })).json() as ExplorerFile
    expect(file).toMatchObject({ path: 'memory/notes/index.md', title: 'index', kind: 'markdown', truncated: false })
    expect(file.content).toContain('A hub note.')
  })

  it('serves a plain-text file as text and a binary file with empty content', async () => {
    const { app, cookie } = await fixture()
    const text = (await app.inject({ method: 'GET', url: '/api/explorer/file?path=memory/notes/plain.txt', headers: { cookie } })).json() as ExplorerFile
    expect(text).toMatchObject({ kind: 'text', content: 'just text\n' })
    const bin = (await app.inject({ method: 'GET', url: '/api/explorer/file?path=library/blob.bin', headers: { cookie } })).json() as ExplorerFile
    expect(bin).toMatchObject({ kind: 'binary', content: '', size: 4 })
  })

  it('404s missing files and never follows symlinks', async () => {
    const { app, cookie, ws } = await fixture()
    expect((await app.inject({ method: 'GET', url: '/api/explorer/file?path=memory/none.md', headers: { cookie } })).statusCode).toBe(404)
    symlinkSync('/etc/hostname', path.join(ws, 'memory', 'leak.md'))
    expect((await app.inject({ method: 'GET', url: '/api/explorer/file?path=memory/leak.md', headers: { cookie } })).statusCode).toBe(404)
  })

  it('rejects unsafe paths on both endpoints', async () => {
    const { app, cookie } = await fixture()
    for (const bad of ['../etc/passwd', '/etc/passwd', 'a/../b', 'a\\b', '.git/config']) {
      // .git is dotfile-hidden from tree listings; the file endpoint must also refuse traversal.
      const tree = await app.inject({ method: 'GET', url: `/api/explorer/tree?path=${encodeURIComponent(bad)}`, headers: { cookie } })
      expect([400, 404]).toContain(tree.statusCode)
      const file = await app.inject({ method: 'GET', url: `/api/explorer/file?path=${encodeURIComponent(bad)}`, headers: { cookie } })
      expect([400, 404]).toContain(file.statusCode)
    }
    expect((await app.inject({ method: 'GET', url: '/api/explorer/file', headers: { cookie } })).statusCode).toBe(400)
  })

  it('derives safe-path verdicts and titles', () => {
    expect(isSafeVaultPath('memory/notes/index.md')).toBe(true)
    expect(isSafeVaultPath('../x')).toBe(false)
    expect(isSafeVaultPath('/x')).toBe(false)
    expect(isSafeVaultPath('a//b')).toBe(false)
    expect(titleOf('memory/people/alice-smith.md')).toBe('alice smith')
  })
})
