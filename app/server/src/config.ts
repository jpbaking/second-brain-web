import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { deployKeyPath } from './vault/config.js'

/** Subdirectories of the data root (master plan: Default Runtime Layout). */
export const DATA_SUBDIRS = [
  'auth',
  'db',
  'secrets',
  'ssh',
  'workspaces',
  'indexes',
  'logs',
  'sessions',
] as const

export interface AppConfig {
  host: string
  port: number
  dataDir: string
  /** Provider-key encryption key (SECOND_BRAIN_WEB_SECRETS_KEY); may be unset. */
  secretsKey: string | undefined
  /** Maximum size of one uploaded file. */
  uploadMaxBytes: number
}

export class ConfigError extends Error {}

/**
 * Resolve configuration from the environment and prepare the data root.
 * Fails loudly (ConfigError) on missing or unsafe setup — the operator gets
 * an actionable message instead of a half-initialised service.
 */
export function loadConfig (env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = env.SECOND_BRAIN_WEB_DATA_DIR
  if (dataDir === undefined || dataDir.trim() === '') {
    throw new ConfigError(
      'SECOND_BRAIN_WEB_DATA_DIR is not set. Point it at a private directory ' +
      '(e.g. /data/second-brain-web) that will hold auth state, databases, ' +
      'keys, and the vault checkout, then start again.'
    )
  }
  const resolved = path.resolve(dataDir)

  mkdirSync(resolved, { recursive: true, mode: 0o700 })
  assertPrivate(resolved)
  for (const sub of DATA_SUBDIRS) {
    mkdirSync(path.join(resolved, sub), { recursive: true, mode: 0o700 })
  }

  importDeployKey(resolved, env)

  const port = Number(env.SECOND_BRAIN_WEB_PORT ?? 8722)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`SECOND_BRAIN_WEB_PORT is not a valid port: ${env.SECOND_BRAIN_WEB_PORT}`)
  }

  const uploadMaxBytes = Number(env.SECOND_BRAIN_WEB_UPLOAD_MAX_BYTES ?? 50 * 1024 * 1024)
  if (!Number.isSafeInteger(uploadMaxBytes) || uploadMaxBytes < 1) {
    throw new ConfigError(`SECOND_BRAIN_WEB_UPLOAD_MAX_BYTES is not valid: ${env.SECOND_BRAIN_WEB_UPLOAD_MAX_BYTES}`)
  }

  return {
    // Bind to localhost by default (master plan: production defaults).
    host: env.SECOND_BRAIN_WEB_HOST ?? '127.0.0.1',
    port,
    dataDir: resolved,
    secretsKey: env.SECOND_BRAIN_WEB_SECRETS_KEY,
    uploadMaxBytes,
  }
}

/**
 * Import a mounted SSH deploy key into the data root. When
 * SECOND_BRAIN_WEB_SSH_KEY_PATH points at a readable key file (typically a
 * read-only bind mount whose owner/mode need not satisfy ssh's strict checks),
 * copy it to the canonical `<dataDir>/ssh/deploy_key` at mode 600 — and its
 * `.pub` sibling at 644 if present — so every vault git operation keeps using
 * the derived path regardless of how the source was mounted. A missing or
 * unset path is a no-op (the key may instead be generated in place).
 */
export function importDeployKey (dataDir: string, env: NodeJS.ProcessEnv): void {
  const src = env.SECOND_BRAIN_WEB_SSH_KEY_PATH
  if (src === undefined || src.trim() === '') return
  const source = path.resolve(src.trim())
  if (!existsSync(source)) return

  const dest = deployKeyPath(dataDir)
  if (path.resolve(source) !== path.resolve(dest)) {
    copyFileSync(source, dest)
  }
  chmodSync(dest, 0o600)

  const srcPub = `${source}.pub`
  if (existsSync(srcPub)) {
    const destPub = `${dest}.pub`
    if (path.resolve(srcPub) !== path.resolve(destPub)) {
      copyFileSync(srcPub, destPub)
    }
    chmodSync(destPub, 0o644)
  }
}

function assertPrivate (dir: string): void {
  const mode = statSync(dir).mode & 0o777
  if ((mode & 0o077) !== 0) {
    throw new ConfigError(
      `Data directory ${dir} is accessible by other users (mode ${mode.toString(8)}). ` +
      `It holds secrets; run: chmod 700 '${dir}' and start again.`
    )
  }
}
