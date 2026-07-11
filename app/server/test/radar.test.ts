import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openSidecarDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { buildSearchIndex } from '../src/search/index-build.js'
import { readRadar } from '../src/search/radar.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []

function freshSidecar (): DatabaseSync {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-radar-'))
  scratch.push(root)
  const dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dataDir)
  const db = openSidecarDb(dataDir)
  dbs.push(db)
  return db
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('Radar', () => {
  it('identifies stale projects and people, and items with warnings', () => {
    const db = freshSidecar()
    
    // Create some records
    const now = new Date()
    const staleDate = new Date(now.getTime() - 61 * 24 * 60 * 60 * 1000).toISOString()
    const freshDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
    
    buildSearchIndex(db, [
      { path: 'memory/projects/stale.md', title: 'Stale Project', text: 'body', kind: 'memory', mtime: staleDate },
      { path: 'memory/projects/fresh.md', title: 'Fresh Project', text: 'body', kind: 'memory', mtime: freshDate },
      { path: 'memory/people/stale.md', title: 'Stale Person', text: 'body', kind: 'memory', mtime: staleDate },
      { path: 'memory/people/fresh.md', title: 'Fresh Person', text: 'body', kind: 'memory', mtime: freshDate },
      { path: 'memory/notes/warning.md', title: 'Note', text: 'This has a WARNING in it.', kind: 'memory', mtime: freshDate },
      { path: 'memory/notes/todo.md', title: 'Todo Note', text: 'TODO: fix this.', kind: 'memory', mtime: freshDate },
      { path: 'memory/notes/clean.md', title: 'Clean Note', text: 'All good.', kind: 'memory', mtime: freshDate },
    ])
    
    const radar = readRadar(db)
    
    expect(radar.staleProjects).toHaveLength(1)
    expect(radar.staleProjects[0]?.title).toBe('Stale Project')
    
    expect(radar.stalePeople).toHaveLength(1)
    expect(radar.stalePeople[0]?.title).toBe('Stale Person')
    
    expect(radar.warnings).toHaveLength(2)
    const warningTitles = radar.warnings.map(w => w.title)
    expect(warningTitles).toContain('Note')
    expect(warningTitles).toContain('Todo Note')
  })
})
