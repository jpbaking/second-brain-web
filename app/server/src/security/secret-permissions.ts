import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { extendError } from 'error-extender'
import { AppError } from '../errors.js'

/**
 * Startup secret-permission checks (milestone 12). The data root as a whole is
 * already required to be private (`0700`, enforced in loadConfig). This adds a
 * belt-and-braces check on the individual secret files the app writes, so a
 * botched restore or a stray `chmod` that leaves them group/other-readable is
 * caught before the app serves traffic rather than silently leaking.
 *
 * Only files that exist are checked (owner auth and the deploy key are created
 * lazily by the bootstrap scripts), and a file is unsafe if it grants ANY group
 * or other permission bit.
 */

// Secret material that must never be group/other-accessible. The `.pub` deploy
// key is intentionally excluded — a public key is not a secret.
const SECRET_FILES: string[][] = [
  ['auth', 'owner.json'],
  ['ssh', 'deploy_key'],
]

export interface SecretPermissionIssue {
  /** Data-root-relative path of the offending file. */
  path: string
  /** Its current octal mode, e.g. `644`. */
  mode: string
}

export const SecretPermissionError = extendError('SecretPermissionError', { parent: AppError })

/** Return every existing secret file whose mode grants group or other access. */
export function checkSecretPermissions (dataDir: string): SecretPermissionIssue[] {
  const issues: SecretPermissionIssue[] = []
  for (const parts of SECRET_FILES) {
    const full = path.join(dataDir, ...parts)
    if (!existsSync(full)) continue
    const mode = statSync(full).mode & 0o777
    if ((mode & 0o077) !== 0) {
      issues.push({ path: parts.join('/'), mode: mode.toString(8).padStart(3, '0') })
    }
  }
  return issues
}

/**
 * Refuse to continue when any secret file is group/other-accessible, with an
 * actionable message. No-op when everything is private or absent.
 */
export function assertSecretPermissions (dataDir: string): void {
  const issues = checkSecretPermissions(dataDir)
  if (issues.length === 0) return
  const detail = issues.map(issue => `  ${issue.path} is mode ${issue.mode}; run: chmod 600 '${path.join(dataDir, issue.path)}'`).join('\n')
  throw new SecretPermissionError({ message: `secret files are accessible by other users:\n${detail}` })
}
