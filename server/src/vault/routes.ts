import { openCoreDb } from '../db.js'
import { readVaultConfig, writeVaultConfig } from './config.js'
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
}
