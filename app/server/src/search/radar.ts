import type { DatabaseSync } from 'node:sqlite'

export interface RadarItem {
  path: string
  title: string
  mtime?: string
}

export interface RadarData {
  staleProjects: RadarItem[]
  stalePeople: RadarItem[]
  warnings: RadarItem[]
}

export function readRadar (db: DatabaseSync): RadarData {
  const staleProjects = db.prepare(`
    SELECT path, title, mtime FROM vault_search
    WHERE path LIKE 'memory/projects/%'
    AND mtime < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 days')
    ORDER BY mtime ASC
    LIMIT 5
  `).all() as unknown as RadarItem[]

  const stalePeople = db.prepare(`
    SELECT path, title, mtime FROM vault_search
    WHERE path LIKE 'memory/people/%'
    AND mtime < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 days')
    ORDER BY mtime ASC
    LIMIT 5
  `).all() as unknown as RadarItem[]

  const warnings = db.prepare(`
    SELECT path, title FROM vault_search
    WHERE vault_search MATCH 'TODO OR WARNING'
    LIMIT 5
  `).all() as unknown as RadarItem[]

  return { staleProjects, stalePeople, warnings }
}
