import { mkdirSync, statSync } from 'node:fs'
import path from 'node:path'

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
      'keys, and the vault checkout, then start again.',
    )
  }
  const resolved = path.resolve(dataDir)

  mkdirSync(resolved, { recursive: true, mode: 0o700 })
  assertPrivate(resolved)
  for (const sub of DATA_SUBDIRS) {
    mkdirSync(path.join(resolved, sub), { recursive: true, mode: 0o700 })
  }

  const port = Number(env.SECOND_BRAIN_WEB_PORT ?? 8722)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`SECOND_BRAIN_WEB_PORT is not a valid port: ${env.SECOND_BRAIN_WEB_PORT}`)
  }

  return {
    // Bind to localhost by default (master plan: production defaults).
    host: env.SECOND_BRAIN_WEB_HOST ?? '127.0.0.1',
    port,
    dataDir: resolved,
  }
}

function assertPrivate (dir: string): void {
  const mode = statSync(dir).mode & 0o777
  if ((mode & 0o077) !== 0) {
    throw new ConfigError(
      `Data directory ${dir} is accessible by other users (mode ${mode.toString(8)}). ` +
      `It holds secrets; run: chmod 700 '${dir}' and start again.`,
    )
  }
}
