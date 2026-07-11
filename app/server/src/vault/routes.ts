import { existsSync } from 'node:fs'
import path from 'node:path'
import { openCoreDb, openSidecarDb } from '../db.js'
import { readVaultConfig, vaultWorkspacePath, writeVaultConfig } from './config.js'
import { detectVault } from './detect.js'
import { syncVault } from './sync.js'
import { runHealthCheck } from './health.js'
import { readGitStatus } from './git-status.js'
import { readCommandCenter } from './command-center.js'
import { readLock } from './lock.js'
import { commitVault, discardVaultFiles } from './commit.js'
import { reindexAfterVaultChange } from '../search/reindex.js'
import type { AppConfig } from '../config.js'
import type { VaultConfigPatch } from './config.js'
import type { FastifyInstance } from 'fastify'

/** Accept https, ssh, scp-like git@host:path, file://, and absolute paths. */
function isValidRemoteUrl (url: string): boolean {
  if (url.length === 0 || url.length > 512 || /\s/.test(url)) return false
  return /^(https:\/\/|ssh:\/\/|git@[^:]+:|file:\/\/|\/)/.test(url)
}

/** A conservative subset of valid git branch names. */
function isValidBranch (branch: string): boolean {
  if (branch.length === 0 || branch.length > 255 || /\s/.test(branch)) return false
  if (branch.startsWith('-') || branch.endsWith('/') || branch.includes('..')) return false
  return !/[~^:?*[\\]/.test(branch)
}

/**
 * Vault settings endpoints (phase-003 Vault Configuration). Guarded by the
 * global auth guard. Responses carry only the SSH key *path*, never key
 * contents.
 */
export function registerVaultRoutes (app: FastifyInstance, config: AppConfig): void {
  app.get('/api/vault/config', async () => {
    const db = openCoreDb(config.dataDir)
    try {
      return readVaultConfig(db, config.dataDir)
    } finally {
      db.close()
    }
  })

  app.put('/api/vault/config', async (req, reply) => {
    const body = (req.body ?? {}) as { remoteUrl?: unknown, branch?: unknown, displayName?: unknown }
    const patch: VaultConfigPatch = {}

    if (body.remoteUrl !== undefined) {
      if (typeof body.remoteUrl !== 'string' || !isValidRemoteUrl(body.remoteUrl.trim())) {
        return await reply.code(400).send({ error: 'invalid remote URL' })
      }
      patch.remoteUrl = body.remoteUrl.trim()
    }

    if (body.branch !== undefined) {
      if (typeof body.branch !== 'string' || !isValidBranch(body.branch.trim())) {
        return await reply.code(400).send({ error: 'invalid branch name' })
      }
      patch.branch = body.branch.trim()
    }

    if (body.displayName !== undefined) {
      if (typeof body.displayName !== 'string' || body.displayName.length > 200) {
        return await reply.code(400).send({ error: 'invalid display name' })
      }
      const trimmed = body.displayName.trim()
      patch.displayName = trimmed === '' ? null : trimmed
    }

    const db = openCoreDb(config.dataDir)
    try {
      writeVaultConfig(db, patch)
      return readVaultConfig(db, config.dataDir)
    } finally {
      db.close()
    }
  })

  app.post('/api/vault/sync', async () => {
    const db = openCoreDb(config.dataDir)
    try {
      const result = await syncVault(db, config.dataDir)
      const detection = detectVault(vaultWorkspacePath(config.dataDir))
      // A pull/clone can change any indexed file — refresh the search cache.
      reindexAfterVaultChange(config.dataDir, app.log)
      return { ...result, detection }
    } finally {
      db.close()
    }
  })

  app.get('/api/command-center', async () => {
    const db = openCoreDb(config.dataDir)
    const sidecarDb = openSidecarDb(config.dataDir)
    try {
      return await readCommandCenter(db, sidecarDb, config.dataDir)
    } finally {
      db.close()
      sidecarDb.close()
    }
  })

  app.post('/api/vault/health', async () => {
    const db = openCoreDb(config.dataDir)
    try {
      const result = await runHealthCheck(vaultWorkspacePath(config.dataDir))
      writeVaultConfig(db, {
        lastHealth: JSON.stringify({
          available: result.available,
          issueCount: result.issueCount,
          ranAt: result.ranAt,
        }),
      })
      return result
    } finally {
      db.close()
    }
  })

  app.get('/api/vault/status', async () => {
    const db = openCoreDb(config.dataDir)
    try {
      const cfg = readVaultConfig(db, config.dataDir)
      const workspace = vaultWorkspacePath(config.dataDir)
      return {
        configured: cfg.remoteUrl !== null,
        cloned: existsSync(path.join(workspace, '.git')),
        displayName: cfg.displayName,
        remoteUrl: cfg.remoteUrl,
        branch: cfg.branch,
        commit: cfg.lastCommit,
        lastPullAt: cfg.lastPullAt,
        detection: detectVault(workspace),
      }
    } finally {
      db.close()
    }
  })

  app.get('/api/vault/lock', async () => {
    const db = openCoreDb(config.dataDir)
    try {
      return readLock(db)
    } finally {
      db.close()
    }
  })

  app.get('/api/vault/review', async () => {
    const workspace = vaultWorkspacePath(config.dataDir)
    const [git, health] = await Promise.all([
      readGitStatus(workspace, { includeDiff: true, includeFileDiffs: true, includeFileContents: true }),
      runHealthCheck(workspace),
    ])
    return { git, health }
  })

  app.post('/api/vault/commit', async (req, reply) => {
    const db = openCoreDb(config.dataDir)
    const body = (req.body ?? {}) as { files?: string[] }
    try {
      const options = body.files ? { files: body.files } : {}
      const result = await commitVault(db, config.dataDir, options)
      if (!result.success) return await reply.code(400).send(result)
      // The vault content just changed on disk — refresh the search cache.
      reindexAfterVaultChange(config.dataDir, app.log)
      return result
    } finally {
      db.close()
    }
  })

  app.post('/api/vault/discard', async (req, reply) => {
    const body = (req.body ?? {}) as { files?: string[] }
    if (!Array.isArray(body.files) || body.files.length === 0) {
      return await reply.code(400).send({ error: 'files array is required' })
    }
    const result = await discardVaultFiles(config.dataDir, body.files)
    if (!result.success) return await reply.code(400).send(result)

    // The vault content just changed on disk — refresh the search cache.
    reindexAfterVaultChange(config.dataDir, app.log)
    return result
  })
}
