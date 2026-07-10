import { readVaultConfig, vaultWorkspacePath, writeVaultConfig } from './config.js'
import { runGit } from './git.js'
import { readGitStatus } from './git-status.js'
import { acquireLock, releaseLock } from './lock.js'
import { runHealthCheck } from './health.js'
import type { HealthResult } from './health.js'
import type { DatabaseSync } from 'node:sqlite'

export interface VaultCommitResult {
  success: boolean
  commit: string | null
  message: string
  health?: HealthResult
}

export async function commitVault (db: DatabaseSync, dataDir: string, now: Date = new Date()): Promise<VaultCommitResult> {
  const cfg = readVaultConfig(db, dataDir)
  const workspace = vaultWorkspacePath(dataDir)
  const keyPath = cfg.sshKeyPath

  if (cfg.remoteUrl === null || cfg.remoteUrl === '') {
    return { success: false, commit: cfg.lastCommit, message: 'No git remote configured.' }
  }

  const status = await readGitStatus(workspace)
  if (!status.isRepo) {
    return { success: false, commit: cfg.lastCommit, message: 'Workspace is not a usable git repository.' }
  }

  if (!status.dirty) {
    return { success: true, commit: status.commit, message: 'Vault is already up to date (clean working tree).' }
  }

  // Take the single-writer lock so a manual commit cannot race an agent session
  // that is mid-write. Fails fast if another writer holds it.
  const lock = acquireLock(db, { sessionId: null, operation: 'commit', now })
  if (!lock.acquired) {
    return { success: false, commit: status.commit, message: 'Another session holds the vault write lock; try again shortly.' }
  }
  const lockId = lock.lock?.lockId ?? null

  try {
    const health = await runHealthCheck(workspace)
    writeVaultConfig(db, {
      lastHealth: JSON.stringify({ available: health.available, issueCount: health.issueCount, ranAt: health.ranAt }),
    }, now)
    if (!health.available || health.issueCount !== 0) {
      const reason = health.message ?? (health.issueCount === null
        ? 'The health result could not be interpreted.'
        : `The vault health check reported ${health.issueCount} issue${health.issueCount === 1 ? '' : 's'}.`)
      return { success: false, commit: status.commit, message: `Commit blocked: ${reason}`, health }
    }

    // Stage all changes
    const add = await runGit(['-C', workspace, 'add', '.'])
    if (add.code !== 0) {
      return { success: false, commit: status.commit, message: add.stderr.trim() || 'git add failed.' }
    }

    // Commit
    const commitMsg = buildCommitMessage(status.changedFiles, now)
    const commitResult = await runGit([
      '-C', workspace,
      '-c', 'user.name=Second Brain Web',
      '-c', 'user.email=system@secondbrain.local',
      'commit', '-m', commitMsg,
    ])
    if (commitResult.code !== 0) {
      return { success: false, commit: status.commit, message: commitResult.stderr.trim() || 'git commit failed.' }
    }

    // Push
    const push = await runGit(['-C', workspace, 'push', 'origin', cfg.branch], { keyPath })
    if (push.code !== 0) {
      return { success: false, commit: status.commit, message: push.stderr.trim() || 'git push failed.' }
    }

    const head = await runGit(['-C', workspace, 'rev-parse', 'HEAD'])
    const commit = head.code === 0 ? head.stdout.trim() : null
    writeVaultConfig(db, { lastCommit: commit }, now)

    return { success: true, commit, message: 'Successfully committed and pushed changes.', health }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, commit: status.commit, message }
  } finally {
    if (lockId !== null) releaseLock(db, lockId)
  }
}

export function buildCommitMessage (changedFiles: string[], now: Date): string {
  const count = changedFiles.length
  const paths = changedFiles.map(file => `- ${file}`).join('\n')
  return `vault: update ${count} file${count === 1 ? '' : 's'} via web\n\nOperation: ${now.toISOString()}\n\nReviewed paths:\n${paths}`
}
