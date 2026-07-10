import { existsSync, lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { openSidecarDb } from '../db.js'
import { vaultWorkspacePath } from '../vault/config.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

/**
 * Explorer API (milestone 11). Serves the vault link graph from the sidecar
 * `vault_links` table as nodes + edges for the explorer screen. Nodes are the
 * distinct endpoints of the edges, each tagged with an "area" (memory subfolder
 * / library / reports) so the UI can filter. An optional `?area=` narrows the
 * graph to edges that touch that area.
 *
 * Guarded by the m02 auth guard (a non-health/status/auth `/api/` route).
 */

export interface ExplorerEdge { from: string, to: string, label: string }
export interface ExplorerNode { path: string, area: string, degree: number }
export interface ExplorerGraph { areas: string[], nodes: ExplorerNode[], edges: ExplorerEdge[] }

export interface ExplorerNodeDetail {
  path: string
  area: string
  title: string
  exists: boolean
  preview: string
  outgoing: Array<{ to: string, label: string }>
  incoming: Array<{ from: string, label: string }>
}

export function registerExplorerRoutes (app: FastifyInstance, config: AppConfig): void {
  app.get('/api/explorer', async (req) => {
    const area = (req.query as { area?: string }).area
    const db = openSidecarDb(config.dataDir)
    try {
      const rows = db.prepare('SELECT from_path, to_path, label FROM vault_links').all() as Array<{ from_path: string, to_path: string, label: string }>
      return buildGraph(rows, typeof area === 'string' && area !== '' ? area : null)
    } finally {
      db.close()
    }
  })

  // Detail panel for a single node: its links in both directions plus a title
  // and text preview read (safely) from the vault checkout.
  app.get('/api/explorer/node', async (req, reply) => {
    const target = (req.query as { path?: string }).path
    if (typeof target !== 'string' || !isSafeVaultPath(target)) {
      return await reply.code(400).send({ error: 'A valid vault path is required.' })
    }
    const db = openSidecarDb(config.dataDir)
    try {
      const outgoing = (db.prepare('SELECT to_path, label FROM vault_links WHERE from_path = ? ORDER BY to_path, label').all(target) as Array<{ to_path: string, label: string }>)
        .map(row => ({ to: row.to_path, label: row.label }))
      const incoming = (db.prepare('SELECT from_path, label FROM vault_links WHERE to_path = ? ORDER BY from_path, label').all(target) as Array<{ from_path: string, label: string }>)
        .map(row => ({ from: row.from_path, label: row.label }))
      const content = readVaultText(config.dataDir, target)
      return {
        path: target,
        area: areaOf(target),
        title: content.title,
        exists: content.exists,
        preview: content.preview,
        outgoing,
        incoming,
      } satisfies ExplorerNodeDetail
    } finally {
      db.close()
    }
  })
}

/** A vault-relative path is safe if it has no traversal, absolute, or backslash parts. */
function isSafeVaultPath (target: string): boolean {
  if (target === '' || target.startsWith('/') || target.includes('\\')) return false
  const segments = target.split('/')
  return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

/** Read a node's title + text preview from the checkout, confined to the vault and to real files. */
function readVaultText (dataDir: string, target: string): { title: string, exists: boolean, preview: string } {
  const base = target.split('/').pop() ?? target
  const title = base.replace(/\.[^.]+$/, '').replaceAll(/[-_]+/g, ' ').trim()
  const full = path.join(vaultWorkspacePath(dataDir), ...target.split('/'))
  // Only read a real (non-symlink) markdown file; anything else is title-only.
  if (!existsSync(full) || !lstatSync(full).isFile() || path.extname(full).toLowerCase() !== '.md') {
    return { title, exists: existsSync(full), preview: '' }
  }
  const body = readFileSync(full, 'utf8').slice(0, 8 * 1024)
  const heading = /^#\s+(.+?)\s*$/m.exec(body)?.[1]?.trim()
  const preview = body.replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 400)
  return { title: heading ?? title, exists: true, preview }
}

export function buildGraph (rows: Array<{ from_path: string, to_path: string, label: string }>, area: string | null): ExplorerGraph {
  // Areas offered for filtering come from the whole graph, not the filtered view.
  const areas = [...new Set(rows.flatMap(row => [areaOf(row.from_path), areaOf(row.to_path)]))].sort()

  const selected = area === null
    ? rows
    : rows.filter(row => areaOf(row.from_path) === area || areaOf(row.to_path) === area)

  const edges: ExplorerEdge[] = selected
    .map(row => ({ from: row.from_path, to: row.to_path, label: row.label }))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.label.localeCompare(b.label))

  const degree = new Map<string, number>()
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1)
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1)
  }
  const nodes: ExplorerNode[] = [...degree.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map(path => ({ path, area: areaOf(path), degree: degree.get(path) ?? 0 }))

  return { areas, nodes, edges }
}

/**
 * The "area" a path belongs to: a memory subfolder (`memory/notes/x.md` →
 * `notes`), otherwise the top-level directory (`library`, `reports`, or flat
 * `memory`).
 */
export function areaOf (filePath: string): string {
  const segments = filePath.split('/')
  if (segments[0] === 'memory' && segments.length > 2) return segments[1] ?? 'memory'
  return segments[0] ?? ''
}
