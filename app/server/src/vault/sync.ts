import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { readVaultConfig, vaultWorkspacePath, writeVaultConfig } from './config.js'
import { runGit } from './git.js'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Clone or update the vault checkout under workspaces/second-brain
 * (phase-003 Clone Flow). Never destructive: pulls are fast-forward only, and a
 * workspace whose origin does not match the configured remote is refused rather
 * than overwritten.
 */

export type VaultSyncState = 'ready' | 'not-configured' | 'remote-mismatch' | 'error'

export interface VaultSyncResult {
  state: VaultSyncState
  branch: string
  commit: string | null
  message: string
}

function normaliseRemote (url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function isEmptyDir (dir: string): boolean {
  return !existsSync(dir) || readdirSync(dir).length === 0
}

export async function syncVault (db: DatabaseSync, dataDir: string, now: Date = new Date()): Promise<VaultSyncResult> {
  const cfg = readVaultConfig(db, dataDir)
  const workspace = vaultWorkspacePath(dataDir)
  const keyPath = cfg.sshKeyPath

  if (cfg.remoteUrl === null || cfg.remoteUrl === '') {
    return { state: 'not-configured', branch: cfg.branch, commit: cfg.lastCommit, message: 'No git remote configured.' }
  }

  try {
    if (existsSync(path.join(workspace, '.git'))) {
      const remote = await runGit(['-C', workspace, 'remote', 'get-url', 'origin'])
      if (remote.code !== 0) {
        return { state: 'error', branch: cfg.branch, commit: cfg.lastCommit, message: 'Workspace is not a usable git repository.' }
      }
      if (normaliseRemote(remote.stdout) !== normaliseRemote(cfg.remoteUrl)) {
        return {
          state: 'remote-mismatch',
          branch: cfg.branch,
          commit: cfg.lastCommit,
          message: 'The existing checkout points at a different remote. Resolve it on the host before syncing.',
        }
      }
      const pull = await runGit(['-C', workspace, 'pull', '--ff-only', 'origin', cfg.branch], { keyPath })
      if (pull.code !== 0) {
        return { state: 'error', branch: cfg.branch, commit: cfg.lastCommit, message: pull.stderr.trim() || 'git pull failed.' }
      }
    } else {
      if (!isEmptyDir(workspace)) {
        return { state: 'error', branch: cfg.branch, commit: cfg.lastCommit, message: 'Workspace exists but is not a git checkout.' }
      }
      const clone = await runGit(['clone', '--branch', cfg.branch, cfg.remoteUrl, workspace], { keyPath })
      if (clone.code !== 0) {
        return { state: 'error', branch: cfg.branch, commit: cfg.lastCommit, message: clone.stderr.trim() || 'git clone failed.' }
      }
    }

    const head = await runGit(['-C', workspace, 'rev-parse', 'HEAD'])
    const commit = head.code === 0 ? head.stdout.trim() : null
    writeVaultConfig(db, { lastCommit: commit, lastPullAt: now.toISOString() }, now)
    return { state: 'ready', branch: cfg.branch, commit, message: 'Vault is up to date.' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { state: 'error', branch: cfg.branch, commit: cfg.lastCommit, message }
  }
}
