import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { verify } from '@node-rs/argon2'
import { OWNER_AUTH_FILE } from './bootstrap.js'
import { writeOwnerAuth } from './bootstrap.js'
import type { OwnerAuthState, PersistedOwnerAuthState } from './bootstrap.js'
import { decryptSecret } from '../secrets/crypto.js'

/**
 * Read and verify owner auth state written by the reset script
 * (auth/owner.json). The plaintext password never touches disk; only the
 * Argon2id hash is stored, so verification runs through argon2's `verify`.
 */

export function ownerAuthPath (dataDir: string): string {
  return path.join(dataDir, 'auth', OWNER_AUTH_FILE)
}

/** Load owner auth state, or null when owner auth has not been set up yet. */
export function readOwnerAuth (
  dataDir: string,
  env: NodeJS.ProcessEnv = process.env
): OwnerAuthState | null {
  const file = ownerAuthPath(dataDir)
  if (!existsSync(file)) return null
  const stored = JSON.parse(readFileSync(file, 'utf8')) as OwnerAuthState | PersistedOwnerAuthState
  if (stored.version === 1) {
    // Encrypt first; writeOwnerAuth does not touch the existing file if key
    // validation/encryption fails, so legacy credentials cannot be destroyed.
    writeOwnerAuth(dataDir, stored, env)
    return stored
  }
  if (stored.version !== 2 || typeof stored.totp.secretEncrypted !== 'string') {
    throw new Error('unsupported or malformed owner auth state')
  }
  return {
    version: 1,
    createdAt: stored.createdAt,
    password: stored.password,
    totp: {
      algorithm: stored.totp.algorithm,
      digits: stored.totp.digits,
      period: stored.totp.period,
      secretBase32: decryptSecret(stored.totp.secretEncrypted, env),
      createdAt: stored.totp.createdAt,
    },
  }
}

/** True once the reset script has generated owner credentials. */
export function isOwnerConfigured (dataDir: string): boolean {
  return existsSync(ownerAuthPath(dataDir))
}

/**
 * Verify a candidate password against the stored Argon2id hash. Returns false
 * (never throws) when owner auth is not configured.
 */
export async function verifyOwnerPassword (
  dataDir: string,
  password: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const owner = readOwnerAuth(dataDir, env)
  if (owner === null) return false
  return await verify(owner.password.hash, password)
}
