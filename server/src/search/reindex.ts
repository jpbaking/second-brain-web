import { openSidecarDb } from '../db.js'
import { vaultWorkspacePath } from '../vault/config.js'
import { scanSearchRecords } from './scan.js'
import { buildSearchIndex } from './index-build.js'

/**
 * Rebuild the whole search index from the current vault checkout (milestone 10).
 * The index is a cache, so this is the single freshness primitive: it rescans
 * `memory/`, `library/catalog.md`, and `reports/` and rewrites `vault_search`
 * (a full DELETE + reinsert), so entries for deleted or renamed files never go
 * stale. Called on demand (manual endpoint) and after vault-changing flows
 * (commit, sync). Returns the number of indexed records.
 */
export function rebuildSearchIndex (dataDir: string): number {
  const db = openSidecarDb(dataDir)
  try {
    return buildSearchIndex(db, scanSearchRecords(vaultWorkspacePath(dataDir)))
  } finally {
    db.close()
  }
}

/**
 * Best-effort reindex for use inside a vault-mutating request handler: a failed
 * reindex must never fail the underlying operation (the commit/sync already
 * succeeded and the index will be rebuilt on the next trigger or manual run).
 */
export function reindexAfterVaultChange (dataDir: string, log?: { warn: (msg: string) => void }): void {
  try {
    rebuildSearchIndex(dataDir)
  } catch (err) {
    log?.warn(`search reindex after vault change failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
