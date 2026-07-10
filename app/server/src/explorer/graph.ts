import { openSidecarDb } from '../db.js'
import { vaultWorkspacePath } from '../vault/config.js'
import { extractVaultLinks } from './links.js'
import type { VaultLink } from './links.js'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Link graph persistence (milestone 11). Writes {@link extractVaultLinks} edges
 * into the sidecar `vault_links` table. Like the search index this is a
 * rebuildable cache, so the build is deterministic: clear + reinsert in one
 * transaction, leaving no stale edges for deleted files or removed links.
 */
export function buildLinkGraph (db: DatabaseSync, links: VaultLink[]): number {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec('DELETE FROM vault_links')
    const insert = db.prepare('INSERT INTO vault_links (from_path, to_path, label) VALUES (?, ?, ?)')
    for (const link of links) insert.run(link.from, link.to, link.label)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return links.length
}

/** Rebuild the whole link graph from the current vault checkout. */
export function rebuildLinkGraph (dataDir: string): number {
  const db = openSidecarDb(dataDir)
  try {
    return buildLinkGraph(db, extractVaultLinks(vaultWorkspacePath(dataDir)))
  } finally {
    db.close()
  }
}

/** Number of edges currently in the link graph. */
export function linkGraphCount (db: DatabaseSync): number {
  return (db.prepare('SELECT count(*) AS n FROM vault_links').get() as { n: number }).n
}
