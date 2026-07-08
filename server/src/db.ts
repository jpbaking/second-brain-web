import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

/**
 * Open a SQLite database with the project's required pragmas applied.
 * Every connection gets WAL and foreign keys (master plan: SQLite
 * Robustness Contract) — never open a database any other way.
 */
export function openDatabase (file: string): DatabaseSync {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  return db
}

/** Core app state: auth sessions, chat metadata, approvals, providers… */
export function coreDbPath (dataDir: string): string {
  return path.join(dataDir, 'db', 'app.sqlite')
}

/** Rebuildable sidecar: search indexes, link graphs, derived file lists. */
export function sidecarDbPath (dataDir: string): string {
  return path.join(dataDir, 'indexes', 'vault.sqlite')
}

export function openCoreDb (dataDir: string): DatabaseSync {
  return openDatabase(coreDbPath(dataDir))
}

export function openSidecarDb (dataDir: string): DatabaseSync {
  return openDatabase(sidecarDbPath(dataDir))
}
