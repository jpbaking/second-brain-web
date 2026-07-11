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
import { scanSearchRecords } from '../src/search/scan.js'
import { buildSearchIndex } from '../src/search/index-build.js'
import { toMatchQuery } from '../src/search/routes.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

function cookieValue (header: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header]
  return values.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0]
}

async function fixture (): Promise<{ app: FastifyInstance, cookie: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-search-api-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'test-owner-key' })
  prepareDatabases(config.dataDir)
  const ws = vaultWorkspacePath(config.dataDir)
  const write = (rel: string, body: string) => {
    const full = path.join(ws, ...rel.split('/'))
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  write('memory/notes/reminders.md', '# Reminders\n\nRenew the domain registration soon.\n')
  write('memory/people/alice.md', '# Alice\n\nAlice leads the finance team.\n')
  write('library/catalog.md', '# Library catalogue\n\nContract for the domain purchase.\n')
  write('reports/2026/weekly.md', '# Weekly review\n\nShipped the domain migration.\n')

  // Build the index up front (rebuild triggers arrive in m10-05).
  const db = openSidecarDb(config.dataDir)
  buildSearchIndex(db, scanSearchRecords(ws))
  db.close()

  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
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

describe('search API', () => {
  it('requires authentication and validates input', async () => {
    const { app, cookie } = await fixture()
    expect((await app.inject({ method: 'GET', url: '/api/search?q=domain' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/search', headers: { cookie } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/api/search?q=domain&kind=bogus', headers: { cookie } })).statusCode).toBe(400)
  })

  it('returns ranked hits with snippets across memory, catalog, and reports', async () => {
    const { app, cookie } = await fixture()
    const res = await app.inject({ method: 'GET', url: '/api/search?q=domain', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { query: string, count: number, results: Array<{ path: string, kind: string, snippet: string }> }
    const paths = body.results.map(r => r.path).sort()
    expect(paths).toEqual(['library/catalog.md', 'memory/notes/reminders.md', 'reports/2026/weekly.md'])
    expect(body.count).toBe(3)
    // Snippet highlights the matched term.
    expect(body.results.every(r => r.snippet.includes('[domain]') || r.snippet.toLowerCase().includes('domain'))).toBe(true)
  })

  it('filters by kind', async () => {
    const { app, cookie } = await fixture()
    const res = await app.inject({ method: 'GET', url: '/api/search?q=domain&kind=report', headers: { cookie } })
    const body = res.json() as { results: Array<{ path: string, kind: string }> }
    expect(body.results.map(r => r.path)).toEqual(['reports/2026/weekly.md'])
    expect(body.results.every(r => r.kind === 'report')).toBe(true)
  })

  it('does prefix matching and tolerates FTS operator characters without crashing', async () => {
    const { app, cookie } = await fixture()
    // Prefix: "dom" should still find "domain".
    const prefix = await app.inject({ method: 'GET', url: '/api/search?q=dom', headers: { cookie } })
    expect(prefix.statusCode).toBe(200)
    expect((prefix.json() as { count: number }).count).toBe(3)

    // Raw FTS syntax must not reach the matcher unescaped — it is tokenised to
    // words (here "domain" AND "purchase"), so this only hits the catalogue.
    const messy = await app.inject({ method: 'GET', url: `/api/search?q=${encodeURIComponent('domain purchase "(')}`, headers: { cookie } })
    expect(messy.statusCode).toBe(200)
    expect((messy.json() as { results: Array<{ path: string }> }).results.map(r => r.path)).toEqual(['library/catalog.md'])

    // Punctuation-only input yields no tokens and an empty result set.
    const empty = await app.inject({ method: 'GET', url: `/api/search?q=${encodeURIComponent('***')}`, headers: { cookie } })
    expect(empty.statusCode).toBe(200)
    expect((empty.json() as { count: number }).count).toBe(0)
  })

  it('builds safe prefix match expressions', () => {
    expect(toMatchQuery('Hello World')).toBe('"hello"* "world"*')
    expect(toMatchQuery('  ')).toBeNull()
    expect(toMatchQuery('a "b) c')).toBe('"a"* "b"* "c"*')
  })
})
