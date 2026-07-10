import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { openSidecarDb } from '../src/db.js'
import { vaultWorkspacePath } from '../src/vault/config.js'
import { rebuildLinkGraph } from '../src/explorer/graph.js'
import { rebuildVaultIndexes } from '../src/search/reindex.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []

function dataDir (): string {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-explorer-graph-'))
  scratch.push(root)
  const dir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dir)
  return dir
}

function write (dir: string, rel: string, body: string): void {
  const full = path.join(vaultWorkspacePath(dir), ...rel.split('/'))
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, body)
}

function edges (dir: string): Array<{ from_path: string, to_path: string, label: string }> {
  const db = openSidecarDb(dir)
  dbs.push(db)
  return db.prepare('SELECT from_path, to_path, label FROM vault_links ORDER BY from_path, to_path, label').all() as Array<{ from_path: string, to_path: string, label: string }>
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('vault link graph', () => {
  it('persists extracted edges into vault_links', () => {
    const dir = dataDir()
    write(dir, 'memory/notes/index.md', '# Index\n\n[Alice](../people/alice.md)\n')
    write(dir, 'memory/people/alice.md', '# Alice\n\n[Apollo](../projects/apollo.md)\n')

    expect(rebuildLinkGraph(dir)).toBe(2)
    expect(edges(dir)).toEqual([
      { from_path: 'memory/notes/index.md', to_path: 'memory/people/alice.md', label: 'Alice' },
      { from_path: 'memory/people/alice.md', to_path: 'memory/projects/apollo.md', label: 'Apollo' },
    ])
  })

  it('rebuilds deterministically with no stale edges', () => {
    const dir = dataDir()
    write(dir, 'memory/a.md', '# A\n\n[to b](b.md) and [to c](c.md)\n')
    expect(rebuildLinkGraph(dir)).toBe(2)

    // Remove one link and rebuild — the stale edge must disappear.
    write(dir, 'memory/a.md', '# A\n\n[to b](b.md)\n')
    expect(rebuildLinkGraph(dir)).toBe(1)
    expect(edges(dir).map(e => e.to_path)).toEqual(['memory/b.md'])

    // Running again is idempotent (no duplicates).
    rebuildLinkGraph(dir)
    expect(edges(dir)).toHaveLength(1)
  })

  it('rebuildVaultIndexes refreshes both the search index and link graph', () => {
    const dir = dataDir()
    write(dir, 'memory/notes/index.md', '# Index\n\nThe kestrel links to [Alice](../people/alice.md).\n')
    write(dir, 'memory/people/alice.md', '# Alice\n')

    const result = rebuildVaultIndexes(dir)
    expect(result.records).toBe(2) // two memory pages indexed
    expect(result.links).toBe(1) // one edge extracted

    const db = openSidecarDb(dir)
    dbs.push(db)
    expect((db.prepare('SELECT count(*) AS n FROM vault_links').get() as { n: number }).n).toBe(1)
    expect((db.prepare('SELECT count(*) AS n FROM vault_search WHERE vault_search MATCH ?').get('kestrel') as { n: number }).n).toBe(1)
  })
})
