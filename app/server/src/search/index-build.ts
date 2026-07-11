import type { SearchRecord } from './scan.js'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Build the FTS5 search index (milestone 10) from scanned {@link SearchRecord}s.
 * The index is a rebuildable cache, so the build is deterministic: it clears
 * `vault_search` and reinserts every record inside one transaction. Running it
 * again over the same records yields the same table with no duplicates.
 *
 * Takes an already-open sidecar DB (see `openSidecarDb`) so callers can compose
 * it with a scan and their own connection lifecycle.
 */
export function buildSearchIndex (db: DatabaseSync, records: SearchRecord[]): number {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec('DELETE FROM vault_search')
    const insert = db.prepare('INSERT INTO vault_search (path, title, body, kind, mtime) VALUES (?, ?, ?, ?, ?)')
    for (const record of records) {
      insert.run(record.path, record.title, record.text, record.kind, record.mtime)
    }
    db.prepare(
      `INSERT INTO vault_index_metadata (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run('search_record_count', String(records.length), new Date().toISOString())
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return records.length
}

/** Number of rows currently in the FTS index. */
export function searchIndexCount (db: DatabaseSync): number {
  return (db.prepare('SELECT count(*) AS n FROM vault_search').get() as { n: number }).n
}
