import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { readVaultConfig, vaultWorkspacePath } from './config.js'
import { readGitStatus } from './git-status.js'
import { readLock } from './lock.js'
import type { GitStatus } from './git-status.js'
import type { LockState } from './lock.js'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Command-center aggregate (phase-001 Daily Command Center / roadmap M4). Pulls
 * together the concrete signals available now: git status, last health, the
 * write lock, the inbox backlog, and recent reports. Reminders and commitments
 * require memory/ parsing that is not yet specified, so they are returned empty
 * for now.
 */

export interface HealthSummary {
  available: boolean
  issueCount: number | null
  ranAt: string
}

export interface CommandCenter {
  vault: {
    configured: boolean
    cloned: boolean
    branch: string
    commit: string | null
  }
  git: GitStatus
  health: HealthSummary | null
  lock: LockState
  inboxBacklog: number
  recentReports: string[]
  reminders: never[]
  commitments: never[]
}

const REPORT_EXT = /\.(html|pdf|md)$/i

function countFiles (dir: string): number {
  if (!existsSync(dir)) return 0
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name))
    else if (entry.isFile()) count += 1
  }
  return count
}

function listRecentReports (dir: string, limit = 5): string[] {
  if (!existsSync(dir)) return []
  const files: Array<{ rel: string, mtime: number }> = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && REPORT_EXT.test(entry.name)) {
        files.push({ rel: path.relative(dir, full), mtime: statSync(full).mtimeMs })
      }
    }
  }
  walk(dir)
  return files.sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((f) => f.rel)
}

function parseHealth (raw: string | null): HealthSummary | null {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as HealthSummary
  } catch {
    return null
  }
}

export async function readCommandCenter (db: DatabaseSync, dataDir: string): Promise<CommandCenter> {
  const cfg = readVaultConfig(db, dataDir)
  const workspace = vaultWorkspacePath(dataDir)
  const git = await readGitStatus(workspace)

  return {
    vault: {
      configured: cfg.remoteUrl !== null,
      cloned: existsSync(path.join(workspace, '.git')),
      branch: git.branch ?? cfg.branch,
      commit: git.commit ?? cfg.lastCommit,
    },
    git,
    health: parseHealth(cfg.lastHealth),
    lock: readLock(db),
    inboxBacklog: countFiles(path.join(workspace, 'inbox')),
    recentReports: listRecentReports(path.join(workspace, 'reports')),
    reminders: [],
    commitments: [],
  }
}
