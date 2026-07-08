import { existsSync, rmSync } from 'node:fs'
import { coreDbPath, openCoreDb, openSidecarDb, sidecarDbPath } from './db.js'
import type { DatabaseSync } from 'node:sqlite'

interface Migration {
  version: number
  sql: string
}

const coreMigrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        user_agent TEXT,
        ip TEXT,
        revoked_at TEXT
      );
      CREATE INDEX sessions_expires_at ON sessions (expires_at);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE pending_challenges (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX pending_challenges_expires_at ON pending_challenges (expires_at);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE login_throttle (
        key TEXT PRIMARY KEY,
        fail_count INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        updated_at TEXT NOT NULL
      )
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE vault_config (
        vault_id TEXT PRIMARY KEY,
        display_name TEXT,
        remote_url TEXT,
        branch TEXT NOT NULL DEFAULT 'main',
        last_commit TEXT,
        last_pull_at TEXT,
        last_health TEXT,
        updated_at TEXT NOT NULL
      )
    `,
  },
  {
    version: 6,
    sql: `
      CREATE TABLE vault_lock (
        name TEXT PRIMARY KEY,
        lock_id TEXT NOT NULL,
        session_id TEXT,
        operation TEXT,
        started_at TEXT NOT NULL,
        last_heartbeat TEXT NOT NULL
      )
    `,
  },
]

const sidecarMigrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE vault_index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
  },
]

export class MigrationError extends Error {}

export function prepareDatabases (dataDir: string): void {
  withDatabase(openCoreDb(dataDir), db => {
    assertIntegrity(db, coreDbPath(dataDir))
    migrate(db, coreMigrations)
    assertIntegrity(db, coreDbPath(dataDir))
  })

  withDatabase(openSidecarDb(dataDir), db => {
    assertIntegrity(db, sidecarDbPath(dataDir))
    migrate(db, sidecarMigrations)
    assertIntegrity(db, sidecarDbPath(dataDir))
  })
}

export function rebuildSidecarDatabase (dataDir: string): void {
  const file = sidecarDbPath(dataDir)
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${file}${suffix}`
    if (existsSync(target)) rmSync(target)
  }

  withDatabase(openSidecarDb(dataDir), db => {
    migrate(db, sidecarMigrations)
    assertIntegrity(db, file)
  })
}

function migrate (db: DatabaseSync, migrations: Migration[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    )
  `)
  db.prepare('INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0)').run()

  const current = currentVersion(db)
  const pending = migrations.filter(migration => migration.version > current)
  if (pending.length === 0) return

  db.exec('BEGIN IMMEDIATE')
  try {
    let version = current
    for (const migration of pending) {
      if (migration.version !== version + 1) {
        throw new MigrationError(`Migration gap: expected ${version + 1}, got ${migration.version}`)
      }
      db.exec(migration.sql)
      db.prepare('UPDATE schema_version SET version = ? WHERE id = 1').run(migration.version)
      version = migration.version
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function currentVersion (db: DatabaseSync): number {
  const row = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number }
  return row.version
}

function assertIntegrity (db: DatabaseSync, file: string): void {
  const row = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
  if (row.integrity_check !== 'ok') {
    throw new MigrationError(`SQLite integrity check failed for ${file}: ${row.integrity_check}`)
  }
}

function withDatabase (db: DatabaseSync, fn: (db: DatabaseSync) => void): void {
  try {
    fn(db)
  } finally {
    db.close()
  }
}
