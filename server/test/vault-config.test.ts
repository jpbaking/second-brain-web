import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { deployKeyPath, readVaultConfig, vaultWorkspacePath, writeVaultConfig } from '../src/vault/config.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []
function fixture (): { db: DatabaseSync, dataDir: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-vaultcfg-'))
  scratch.push(root)
  const dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dataDir)
  const db = openCoreDb(dataDir)
  dbs.push(db)
  return { db, dataDir }
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('vault config', () => {
  it('returns defaults with derived paths on a fresh database', () => {
    const { db, dataDir } = fixture()
    const cfg = readVaultConfig(db, dataDir)
    expect(cfg.vaultId).toBe('default')
    expect(cfg.remoteUrl).toBeNull()
    expect(cfg.branch).toBe('main')
    expect(cfg.workspacePath).toBe(vaultWorkspacePath(dataDir))
    expect(cfg.workspacePath).toBe(path.join(dataDir, 'workspaces', 'second-brain'))
    expect(cfg.sshKeyPath).toBe(deployKeyPath(dataDir))
    expect(cfg.sshKeyPath).toBe(path.join(dataDir, 'ssh', 'deploy_key'))
    expect(cfg.lastCommit).toBeNull()
  })

  it('persists a remote URL, branch, and display name', () => {
    const { db, dataDir } = fixture()
    writeVaultConfig(db, {
      remoteUrl: 'git@github.com:owner/vault.git',
      branch: 'work',
      displayName: 'My Vault',
    })
    const cfg = readVaultConfig(db, dataDir)
    expect(cfg.remoteUrl).toBe('git@github.com:owner/vault.git')
    expect(cfg.branch).toBe('work')
    expect(cfg.displayName).toBe('My Vault')
  })

  it('merges patches without clobbering untouched fields', () => {
    const { db, dataDir } = fixture()
    writeVaultConfig(db, { remoteUrl: 'git@github.com:owner/vault.git', branch: 'main' })
    writeVaultConfig(db, { lastCommit: 'abc123', lastPullAt: '2026-07-08T00:00:00.000Z' })
    const cfg = readVaultConfig(db, dataDir)
    expect(cfg.remoteUrl).toBe('git@github.com:owner/vault.git') // preserved
    expect(cfg.branch).toBe('main')
    expect(cfg.lastCommit).toBe('abc123')
    expect(cfg.lastPullAt).toBe('2026-07-08T00:00:00.000Z')
  })
})
