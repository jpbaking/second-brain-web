import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { coreDbPath, openCoreDb, openSidecarDb, sidecarDbPath } from '../src/db.js'
import { prepareDatabases, rebuildSidecarDatabase } from '../src/migrations.js'

const scratch: string[] = []
function tempDataDir (): string {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-migrate-'))
  scratch.push(root)
  return loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('database migrations', () => {
  it('migrates a fresh data dir from zero', () => {
    const dataDir = tempDataDir()
    prepareDatabases(dataDir)

    const core = openCoreDb(dataDir)
    const sidecar = openSidecarDb(dataDir)
    expect(coreDbPath(dataDir)).toBe(path.join(dataDir, 'db', 'app.sqlite'))
    expect(sidecarDbPath(dataDir)).toBe(path.join(dataDir, 'indexes', 'vault.sqlite'))
    expect(tableExists(core, 'app_metadata')).toBe(true)
    expect(tableExists(core, 'sessions')).toBe(true)
    expect(tableExists(core, 'pending_challenges')).toBe(true)
    expect(tableExists(core, 'login_throttle')).toBe(true)
    expect(tableExists(core, 'vault_config')).toBe(true)
    expect(tableExists(core, 'vault_lock')).toBe(true)
    expect(tableExists(core, 'provider_profiles')).toBe(true)
    expect(tableExists(core, 'chat_sessions')).toBe(true)
    expect(tableExists(core, 'chat_events')).toBe(true)
    expect(tableExists(sidecar, 'vault_index_metadata')).toBe(true)
    expect(schemaVersion(core)).toBe(10)
    expect(schemaVersion(sidecar)).toBe(1)
    core.close()
    sidecar.close()
  })

  it('reruns as a no-op without dropping core or sidecar data', () => {
    const dataDir = tempDataDir()
    prepareDatabases(dataDir)

    const core = openCoreDb(dataDir)
    const sidecar = openSidecarDb(dataDir)
    core.prepare('INSERT INTO app_metadata (key, value) VALUES (?, ?)').run('core', 'kept')
    sidecar.prepare('INSERT INTO vault_index_metadata (key, value) VALUES (?, ?)').run('sidecar', 'kept')
    core.close()
    sidecar.close()

    prepareDatabases(dataDir)

    const reopenedCore = openCoreDb(dataDir)
    const reopenedSidecar = openSidecarDb(dataDir)
    expect(metadataValue(reopenedCore, 'app_metadata', 'core')).toBe('kept')
    expect(metadataValue(reopenedSidecar, 'vault_index_metadata', 'sidecar')).toBe('kept')
    reopenedCore.close()
    reopenedSidecar.close()
  })

  it('rebuilds a deleted sidecar without touching core data', () => {
    const dataDir = tempDataDir()
    prepareDatabases(dataDir)

    const core = openCoreDb(dataDir)
    const sidecar = openSidecarDb(dataDir)
    core.prepare('INSERT INTO app_metadata (key, value) VALUES (?, ?)').run('core', 'survives')
    sidecar.prepare('INSERT INTO vault_index_metadata (key, value) VALUES (?, ?)').run('sidecar', 'discarded')
    core.close()
    sidecar.close()

    rebuildSidecarDatabase(dataDir)

    const reopenedCore = openCoreDb(dataDir)
    const rebuiltSidecar = openSidecarDb(dataDir)
    expect(metadataValue(reopenedCore, 'app_metadata', 'core')).toBe('survives')
    expect(tableExists(rebuiltSidecar, 'vault_index_metadata')).toBe(true)
    expect(metadataValue(rebuiltSidecar, 'vault_index_metadata', 'sidecar')).toBeUndefined()
    expect(schemaVersion(rebuiltSidecar)).toBe(1)
    reopenedCore.close()
    rebuiltSidecar.close()
  })
})

function tableExists (db: ReturnType<typeof openCoreDb>, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  return row !== undefined
}

function schemaVersion (db: ReturnType<typeof openCoreDb>): number {
  const row = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number }
  return row.version
}

function metadataValue (db: ReturnType<typeof openCoreDb>, table: string, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM ${table} WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value
}
