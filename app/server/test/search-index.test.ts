import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareDatabases } from '../src/migrations.js'
import { loadConfig } from '../src/config.js'
import { openSidecarDb } from '../src/db.js'
import { scanSearchRecords } from '../src/search/scan.js'
import { buildSearchIndex, searchIndexCount } from '../src/search/index-build.js'
import { vaultWorkspacePath } from '../src/vault/config.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []

function seededDataDir (): string {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-search-index-'))
  scratch.push(root)
  const dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dataDir)
  const ws = vaultWorkspacePath(dataDir)
  const write = (rel: string, body: string) => {
    const full = path.join(ws, ...rel.split('/'))
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  write('memory/notes/reminders.md', '# Reminders\n\nRenew the domain registration soon.\n')
  write('memory/people/alice.md', '# Alice\n\nAlice leads the finance team.\n')
  write('reports/2026/weekly.md', '# Weekly review\n\nShipped the domain migration.\n')
  return dataDir
}

function sidecar (dataDir: string): DatabaseSync {
  const db = openSidecarDb(dataDir)
  dbs.push(db)
  return db
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('search FTS index', () => {
  it('builds a queryable FTS5 index from scanned records', () => {
    const dataDir = seededDataDir()
    const records = scanSearchRecords(vaultWorkspacePath(dataDir))
    const db = sidecar(dataDir)

    const count = buildSearchIndex(db, records)
    expect(count).toBe(records.length)
    expect(searchIndexCount(db)).toBe(records.length)

    // "domain" appears in both the reminder and the weekly report.
    const domain = db.prepare('SELECT path, kind FROM vault_search WHERE vault_search MATCH ? ORDER BY path').all('domain') as Array<{ path: string, kind: string }>
    expect(domain.map(r => r.path)).toEqual(['memory/notes/reminders.md', 'reports/2026/weekly.md'])

    // A title term matches too, and ranking/snippets work.
    const alice = db.prepare("SELECT path, snippet(vault_search, 2, '[', ']', '…', 6) AS s FROM vault_search WHERE vault_search MATCH ? ORDER BY rank").all('finance') as Array<{ path: string, s: string }>
    expect(alice[0]?.path).toBe('memory/people/alice.md')
    expect(alice[0]?.s).toContain('[finance]')

    // Record count is stamped in the sidecar metadata.
    const meta = db.prepare("SELECT value FROM vault_index_metadata WHERE key = 'search_record_count'").get() as { value: string }
    expect(meta.value).toBe(String(records.length))
  })

  it('rebuilds deterministically with no duplicates', () => {
    const dataDir = seededDataDir()
    const records = scanSearchRecords(vaultWorkspacePath(dataDir))
    const db = sidecar(dataDir)

    buildSearchIndex(db, records)
    buildSearchIndex(db, records)
    buildSearchIndex(db, records)

    expect(searchIndexCount(db)).toBe(records.length)
    const hits = db.prepare('SELECT path FROM vault_search WHERE vault_search MATCH ?').all('domain')
    expect(hits).toHaveLength(2) // still two, not six
  })
})
