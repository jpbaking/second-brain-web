import { openSidecarDb } from '../db.js'
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
