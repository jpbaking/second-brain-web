import { existsSync, statSync } from 'node:fs'
import { coreDbPath, openDatabase, sidecarDbPath } from './db.js'
import type { AppConfig } from './config.js'
import type { DatabaseSync } from 'node:sqlite'

export interface SystemStatus {
  dataDir: {
    path: string
    exists: boolean
    mode: string | null
    private: boolean
    state: 'ready' | 'missing' | 'unsafe'
  }
  databases: {
    core: DatabaseStatus
    sidecar: DatabaseStatus
  }
  auth: {
    configured: boolean
    message: string
  }
}

export interface DatabaseStatus {
  path: string
  exists: boolean
  state: 'ready' | 'missing' | 'error'
  integrity: 'ok' | 'missing' | 'error'
  schemaVersion: number | null
  error?: string
}

export function readSystemStatus (config: AppConfig): SystemStatus {
  return {
    dataDir: readDataDirStatus(config.dataDir),
    databases: {
      core: readDatabaseStatus(coreDbPath(config.dataDir)),
      sidecar: readDatabaseStatus(sidecarDbPath(config.dataDir))
    },
    auth: {
      configured: false,
      message: 'Auth not configured - run reset script.'
    }
  }
}

function readDataDirStatus (dataDir: string): SystemStatus['dataDir'] {
  if (!existsSync(dataDir)) {
    return {
      path: dataDir,
      exists: false,
      mode: null,
      private: false,
      state: 'missing'
    }
  }

  const mode = statSync(dataDir).mode & 0o777
  const isPrivate = (mode & 0o077) === 0
  return {
    path: dataDir,
    exists: true,
    mode: mode.toString(8).padStart(3, '0'),
    private: isPrivate,
    state: isPrivate ? 'ready' : 'unsafe'
  }
}

function readDatabaseStatus (file: string): DatabaseStatus {
  if (!existsSync(file)) {
    return {
      path: file,
      exists: false,
      state: 'missing',
      integrity: 'missing',
      schemaVersion: null
    }
  }

  let db: DatabaseSync | undefined
  try {
    db = openDatabase(file)
    const integrity = readIntegrity(db)
    const schemaVersion = readSchemaVersion(db)
    return {
      path: file,
      exists: true,
      state: integrity === 'ok' && schemaVersion !== null ? 'ready' : 'error',
      integrity: integrity === 'ok' ? 'ok' : 'error',
      schemaVersion
    }
  } catch (err) {
    return {
      path: file,
      exists: true,
      state: 'error',
      integrity: 'error',
      schemaVersion: null,
      error: err instanceof Error ? err.message : String(err)
    }
  } finally {
    db?.close()
  }
}

function readIntegrity (db: DatabaseSync): string {
  const row = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
  return row.integrity_check
}

function readSchemaVersion (db: DatabaseSync): number | null {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
    .get()
  if (table === undefined) return null

  const row = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number } | undefined
  return row?.version ?? null
}
