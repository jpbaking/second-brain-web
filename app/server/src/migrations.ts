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
  {
    version: 7,
    sql: `
      CREATE TABLE provider_profiles (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        base_url TEXT,
        headers_json TEXT,
        config_json TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        key_ciphertext TEXT,
        key_last4 TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `,
  },
  {
    version: 8,
    sql: `
      CREATE TABLE chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        provider_profile_id TEXT,
        sdk_session_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX chat_sessions_sdk_session_id ON chat_sessions (sdk_session_id);
      CREATE TABLE chat_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (session_id, seq)
      );
      CREATE INDEX chat_events_session_seq ON chat_events (session_id, seq);
    `,
  },
  {
    version: 9,
    sql: `
      ALTER TABLE chat_sessions ADD COLUMN compaction_summary TEXT;
      ALTER TABLE chat_sessions ADD COLUMN compacted_at TEXT;
    `,
  },
  {
    version: 10,
    sql: `
      ALTER TABLE chat_sessions ADD COLUMN approval_preset TEXT NOT NULL DEFAULT 'normal';
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
  {
    version: 2,
    // FTS5 index over the vault's searchable text (phase-005: lexical search
    // over memory/, library/catalog.md, and reports/). path + title + body are
    // searchable; kind + mtime are stored for display/filtering only.
    sql: `
      CREATE VIRTUAL TABLE vault_search USING fts5 (
        path,
        title,
        body,
        kind UNINDEXED,
        mtime UNINDEXED
      )
    `,
  },
  {
    version: 3,
    // Link graph edges (phase-005 vault_links; milestone 11 explorer). Edges
    // are extracted from markdown links; a rebuildable cache like vault_search.
    sql: `
      CREATE TABLE vault_links (
        from_path TEXT NOT NULL,
        to_path TEXT NOT NULL,
        label TEXT NOT NULL
      );
      CREATE INDEX vault_links_from ON vault_links (from_path);
      CREATE INDEX vault_links_to ON vault_links (to_path);
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
