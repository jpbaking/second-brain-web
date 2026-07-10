import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Vault configuration (phase-003 Vault Configuration). MVP supports a single
 * vault, id `default`. User-editable and runtime fields are persisted in core
 * SQLite; the workspace and SSH-key paths are always derived from the data
 * root so they cannot drift if the deployment moves.
 */

export const DEFAULT_VAULT_ID = 'default'
export const DEFAULT_BRANCH = 'main'
const WORKSPACE_DIRNAME = 'second-brain'

export interface VaultConfig {
  vaultId: string
  displayName: string | null
  remoteUrl: string | null
  branch: string
  /** Derived: <dataDir>/workspaces/second-brain. */
  workspacePath: string
  /** Derived: <dataDir>/ssh/deploy_key (created by generate-deploy-key.sh). */
  sshKeyPath: string
  lastCommit: string | null
  lastPullAt: string | null
  lastHealth: string | null
}

/** Persisted, mergeable fields (everything except the derived paths + id). */
export interface VaultConfigPatch {
  displayName?: string | null
  remoteUrl?: string | null
  branch?: string
  lastCommit?: string | null
  lastPullAt?: string | null
  lastHealth?: string | null
}

export function vaultWorkspacePath (dataDir: string): string {
  return path.join(dataDir, 'workspaces', WORKSPACE_DIRNAME)
}

export function deployKeyPath (dataDir: string): string {
  return path.join(dataDir, 'ssh', 'deploy_key')
}

interface VaultConfigRow {
  display_name: string | null
  remote_url: string | null
  branch: string
  last_commit: string | null
  last_pull_at: string | null
  last_health: string | null
}

function readRow (db: DatabaseSync): VaultConfigRow | undefined {
  return db.prepare('SELECT * FROM vault_config WHERE vault_id = ?')
    .get(DEFAULT_VAULT_ID) as VaultConfigRow | undefined
}

/** Read the vault config, filling defaults and derived paths. */
export function readVaultConfig (db: DatabaseSync, dataDir: string): VaultConfig {
  const row = readRow(db)
  return {
    vaultId: DEFAULT_VAULT_ID,
    displayName: row?.display_name ?? null,
    remoteUrl: row?.remote_url ?? null,
    branch: row?.branch ?? DEFAULT_BRANCH,
    workspacePath: vaultWorkspacePath(dataDir),
    sshKeyPath: deployKeyPath(dataDir),
    lastCommit: row?.last_commit ?? null,
    lastPullAt: row?.last_pull_at ?? null,
    lastHealth: row?.last_health ?? null,
  }
}

/** Merge a patch into the persisted vault config (creating the row if needed). */
export function writeVaultConfig (db: DatabaseSync, patch: VaultConfigPatch, now: Date = new Date()): void {
  const current = readRow(db)
  const merged: VaultConfigRow = {
    display_name: patch.displayName !== undefined ? patch.displayName : current?.display_name ?? null,
    remote_url: patch.remoteUrl !== undefined ? patch.remoteUrl : current?.remote_url ?? null,
    branch: patch.branch !== undefined ? patch.branch : current?.branch ?? DEFAULT_BRANCH,
    last_commit: patch.lastCommit !== undefined ? patch.lastCommit : current?.last_commit ?? null,
    last_pull_at: patch.lastPullAt !== undefined ? patch.lastPullAt : current?.last_pull_at ?? null,
    last_health: patch.lastHealth !== undefined ? patch.lastHealth : current?.last_health ?? null,
  }

  db.prepare(`
    INSERT INTO vault_config
      (vault_id, display_name, remote_url, branch, last_commit, last_pull_at, last_health, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(vault_id) DO UPDATE SET
      display_name = excluded.display_name,
      remote_url = excluded.remote_url,
      branch = excluded.branch,
      last_commit = excluded.last_commit,
      last_pull_at = excluded.last_pull_at,
      last_health = excluded.last_health,
      updated_at = excluded.updated_at
  `).run(
    DEFAULT_VAULT_ID,
    merged.display_name,
    merged.remote_url,
    merged.branch,
    merged.last_commit,
    merged.last_pull_at,
    merged.last_health,
    now.toISOString()
  )
}
