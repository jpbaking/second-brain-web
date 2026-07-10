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
import { vaultWorkspacePath } from '../src/vault/config.js'
import { openSidecarDb } from '../src/db.js'
import { rebuildSearchIndex } from '../src/search/reindex.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

function dataDir (): string {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-search-rebuild-'))
  scratch.push(root)
  return loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
}

function write (dir: string, rel: string, body: string): void {
  const full = path.join(vaultWorkspacePath(dir), ...rel.split('/'))
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, body)
}

function indexedPaths (dir: string, term: string): string[] {
  const db = openSidecarDb(dir)
  try {
    return (db.prepare('SELECT path FROM vault_search WHERE vault_search MATCH ? ORDER BY path').all(term) as Array<{ path: string }>).map(r => r.path)
  } finally {
    db.close()
  }
}

function cookieValue (header: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header]
  return values.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0]
}

async function authedApp (dir: string): Promise<{ app: FastifyInstance, cookie: string }> {
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: dir })
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state)
  const app = buildApp(config)
  apps.push(app)
  const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({ method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code } })
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}` }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('search reindex', () => {
  it('rebuilds from the current vault, leaving no stale entries', () => {
    const dir = dataDir()
    prepareDatabases(dir)
    write(dir, 'memory/notes/keep.md', '# Keep\n\nThe kestrel flies at dawn.\n')
    write(dir, 'memory/notes/gone.md', '# Gone\n\nThe kestrel will be deleted.\n')

    expect(rebuildSearchIndex(dir)).toBe(2)
    expect(indexedPaths(dir, 'kestrel')).toEqual(['memory/notes/keep.md', 'memory/notes/gone.md'].sort())

    // Delete one file and edit the other, then rebuild.
    rmSync(path.join(vaultWorkspacePath(dir), 'memory', 'notes', 'gone.md'))
    write(dir, 'memory/notes/keep.md', '# Keep\n\nThe kestrel now hunts at dusk.\n')

    expect(rebuildSearchIndex(dir)).toBe(1)
    // The deleted file is no longer indexed…
    expect(indexedPaths(dir, 'kestrel')).toEqual(['memory/notes/keep.md'])
    // …and stale text from the old version is gone.
    expect(indexedPaths(dir, 'dawn')).toEqual([])
    expect(indexedPaths(dir, 'dusk')).toEqual(['memory/notes/keep.md'])
  })

  it('reindexes on demand through the guarded endpoint and reflects new files', async () => {
    const dir = dataDir()
    prepareDatabases(dir)
    write(dir, 'memory/notes/first.md', '# First\n\nOsprey sighting logged.\n')
    const { app, cookie } = await authedApp(dir)

    // Requires authentication.
    expect((await app.inject({ method: 'POST', url: '/api/search/reindex' })).statusCode).toBe(401)

    // First reindex indexes the one existing file.
    const first = await app.inject({ method: 'POST', url: '/api/search/reindex', headers: { cookie } })
    expect(first.statusCode).toBe(200)
    expect(first.json().count).toBe(1)

    // A brand-new file is not searchable until a reindex runs.
    write(dir, 'memory/notes/second.md', '# Second\n\nAnother osprey by the estuary.\n')
    const beforeReindex = await app.inject({ method: 'GET', url: '/api/search?q=osprey', headers: { cookie } })
    expect(beforeReindex.json().count).toBe(1)

    const second = await app.inject({ method: 'POST', url: '/api/search/reindex', headers: { cookie } })
    expect(second.json().count).toBe(2)
    const afterReindex = await app.inject({ method: 'GET', url: '/api/search?q=osprey', headers: { cookie } })
    expect(afterReindex.json().count).toBe(2)
  })
})
