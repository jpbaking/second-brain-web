import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { readVaultConfig, vaultWorkspacePath } from './config.js'
import { readGitStatus } from './git-status.js'
import { readLock } from './lock.js'
import { scanReports } from '../reports/scan.js'
import { readRadar } from '../search/radar.js'
import type { ReportMetadata } from '../reports/scan.js'
import type { GitStatus } from './git-status.js'
import type { LockState } from './lock.js'
import type { RadarData } from '../search/radar.js'
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
  recentReports: ReportMetadata[]
  reminders: never[]
  commitments: never[]
  radar: RadarData
}

function countFiles (dir: string): number {
  if (!existsSync(dir)) return 0
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name))
    else if (entry.isFile()) count += 1
  }
  return count
}

function parseHealth (raw: string | null): HealthSummary | null {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as HealthSummary
  } catch {
    return null
  }
}

export async function readCommandCenter (coreDb: DatabaseSync, sidecarDb: DatabaseSync, dataDir: string): Promise<CommandCenter> {
  const cfg = readVaultConfig(coreDb, dataDir)
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
    lock: readLock(coreDb),
    inboxBacklog: countFiles(path.join(workspace, 'inbox')),
    recentReports: scanReports(workspace).slice(0, 5),
    reminders: [],
    commitments: [],
    radar: readRadar(sidecarDb),
  }
}
