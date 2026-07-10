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
import { rebuildLinkGraph } from '../src/explorer/graph.js'
import { areaOf, buildGraph } from '../src/explorer/routes.js'
import type { ExplorerGraph } from '../src/explorer/routes.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

function cookieValue (header: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header]
  return values.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0]
}

async function fixture (): Promise<{ app: FastifyInstance, cookie: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-explorer-api-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') })
  prepareDatabases(config.dataDir)
  const ws = vaultWorkspacePath(config.dataDir)
  const write = (rel: string, body: string) => {
    const full = path.join(ws, ...rel.split('/'))
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  write('memory/notes/index.md', '# Index\n\n[Alice](../people/alice.md) and the [weekly](../../reports/2026/weekly.md).\n')
  write('memory/people/alice.md', '# Alice\n\nLeads [Apollo](../projects/apollo.md).\n')
  write('reports/2026/weekly.md', '# Weekly\n\nSource: [notes](../../memory/notes/index.md).\n')
  rebuildLinkGraph(config.dataDir)

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

describe('explorer API', () => {
  it('requires authentication', async () => {
    const { app } = await fixture()
    expect((await app.inject({ method: 'GET', url: '/api/explorer' })).statusCode).toBe(401)
  })

  it('returns the full graph of nodes, edges, and areas', async () => {
    const { app, cookie } = await fixture()
    const graph = (await app.inject({ method: 'GET', url: '/api/explorer', headers: { cookie } })).json() as ExplorerGraph

    expect(graph.edges).toContainEqual({ from: 'memory/notes/index.md', to: 'memory/people/alice.md', label: 'Alice' })
    expect(graph.edges).toContainEqual({ from: 'reports/2026/weekly.md', to: 'memory/notes/index.md', label: 'notes' })
    expect(graph.edges).toHaveLength(4)

    // Areas cover memory subfolders + reports.
    expect(graph.areas).toEqual(['notes', 'people', 'projects', 'reports'])

    // The hub note is linked from the report and links out to two pages → degree 3.
    const index = graph.nodes.find(n => n.path === 'memory/notes/index.md')
    expect(index).toMatchObject({ area: 'notes', degree: 3 })
    expect(graph.nodes.find(n => n.path === 'memory/projects/apollo.md')?.area).toBe('projects')
  })

  it('filters to edges touching a selected area', async () => {
    const { app, cookie } = await fixture()
    const graph = (await app.inject({ method: 'GET', url: '/api/explorer?area=projects', headers: { cookie } })).json() as ExplorerGraph

    // Only the alice → apollo edge touches the projects area.
    expect(graph.edges).toEqual([{ from: 'memory/people/alice.md', to: 'memory/projects/apollo.md', label: 'Apollo' }])
    expect(graph.nodes.map(n => n.path)).toEqual(['memory/people/alice.md', 'memory/projects/apollo.md'])
    // Areas list still reflects the whole graph so the filter can be changed.
    expect(graph.areas).toContain('reports')
  })

  it('derives an area from a path', () => {
    expect(areaOf('memory/people/alice.md')).toBe('people')
    expect(areaOf('memory/index.md')).toBe('memory')
    expect(areaOf('library/originals/x.pdf')).toBe('library')
    expect(areaOf('reports/2026/weekly.md')).toBe('reports')
  })

  it('builds an empty graph from no edges', () => {
    expect(buildGraph([], null)).toEqual({ areas: [], nodes: [], edges: [] })
  })

  it('serves node detail with title, preview, and links in both directions', async () => {
    const { app, cookie } = await fixture()
    const detail = (await app.inject({ method: 'GET', url: '/api/explorer/node?path=memory/notes/index.md', headers: { cookie } })).json()

    expect(detail).toMatchObject({ path: 'memory/notes/index.md', area: 'notes', title: 'Index', exists: true })
    expect(detail.preview).toContain('Alice')
    expect(detail.outgoing).toContainEqual({ to: 'memory/people/alice.md', label: 'Alice' })
    expect(detail.outgoing).toContainEqual({ to: 'reports/2026/weekly.md', label: 'weekly' })
    // Linked from the weekly report.
    expect(detail.incoming).toContainEqual({ from: 'reports/2026/weekly.md', label: 'notes' })
  })

  it('reports a dangling link target in node detail as not existing', async () => {
    const { app, cookie } = await fixture()
    // apollo.md is linked from alice but never created on disk.
    const detail = (await app.inject({ method: 'GET', url: '/api/explorer/node?path=memory/projects/apollo.md', headers: { cookie } })).json()
    expect(detail).toMatchObject({ exists: false, title: 'apollo', preview: '' })
    expect(detail.incoming).toContainEqual({ from: 'memory/people/alice.md', label: 'Apollo' })
    expect(detail.outgoing).toEqual([])
  })

  it('rejects unsafe or missing paths in node detail', async () => {
    const { app, cookie } = await fixture()
    expect((await app.inject({ method: 'GET', url: '/api/explorer/node', headers: { cookie } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/api/explorer/node?path=../etc/passwd', headers: { cookie } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/api/explorer/node?path=/etc/passwd', headers: { cookie } })).statusCode).toBe(400)
    // Detail requires authentication too.
    expect((await app.inject({ method: 'GET', url: '/api/explorer/node?path=memory/notes/index.md' })).statusCode).toBe(401)
  })
})
