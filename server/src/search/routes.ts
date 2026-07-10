import { openSidecarDb } from '../db.js'
import type { SearchKind } from './scan.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

/**
 * Search API (milestone 10). Queries the FTS5 `vault_search` index built by
 * `buildSearchIndex` and returns ranked hits with a highlighted snippet. The
 * index is a rebuildable cache: if it has never been built the table is simply
 * empty and the query returns no results (rebuild triggers land in m10-05).
 *
 * Guarded by the m02 auth guard (a non-health/status/auth `/api/` route).
 */

const KINDS = new Set<SearchKind>(['memory', 'catalog', 'report'])
const LIMIT = 50

export interface SearchHit {
  path: string
  kind: SearchKind
  title: string
  mtime: string
  snippet: string
}

export function registerSearchRoutes (app: FastifyInstance, config: AppConfig): void {
  app.get('/api/search', async (req, reply) => {
    const query = req.query as { q?: string, kind?: string }
    const raw = typeof query.q === 'string' ? query.q.trim() : ''
    if (raw === '') return await reply.code(400).send({ error: 'A search query is required.' })
    if (query.kind !== undefined && !KINDS.has(query.kind as SearchKind)) {
      return await reply.code(400).send({ error: 'Invalid search kind.' })
    }

    const match = toMatchQuery(raw)
    if (match === null) return { query: raw, count: 0, results: [] }

    const db = openSidecarDb(config.dataDir)
    try {
      const kind = query.kind as SearchKind | undefined
      const sql =
        `SELECT path, kind, title, mtime, snippet(vault_search, -1, '[', ']', '…', 12) AS snippet
         FROM vault_search
         WHERE vault_search MATCH ?${kind !== undefined ? ' AND kind = ?' : ''}
         ORDER BY rank
         LIMIT ${LIMIT}`
      const params = kind !== undefined ? [match, kind] : [match]
      const results = db.prepare(sql).all(...params) as unknown as SearchHit[]
      return { query: raw, count: results.length, results }
    } finally {
      db.close()
    }
  })
}

/**
 * Turn free user text into a safe FTS5 MATCH expression. Raw input can contain
 * FTS operators/quotes that would raise a syntax error, so we extract word
 * tokens and match each as a quoted prefix term (implicit AND). Returns null
 * when the input has no usable tokens.
 */
export function toMatchQuery (raw: string): string | null {
  const tokens = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  if (tokens.length === 0) return null
  return tokens.slice(0, 16).map(token => `"${token}"*`).join(' ')
}
