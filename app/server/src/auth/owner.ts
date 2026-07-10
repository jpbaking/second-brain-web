import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { verify } from '@node-rs/argon2'
import { OWNER_AUTH_FILE } from './bootstrap.js'
import type { OwnerAuthState } from './bootstrap.js'

/**
 * Read and verify owner auth state written by the reset script
 * (auth/owner.json). The plaintext password never touches disk; only the
 * Argon2id hash is stored, so verification runs through argon2's `verify`.
 */

export function ownerAuthPath (dataDir: string): string {
  return path.join(dataDir, 'auth', OWNER_AUTH_FILE)
}

/** Load owner auth state, or null when owner auth has not been set up yet. */
export function readOwnerAuth (dataDir: string): OwnerAuthState | null {
  const file = ownerAuthPath(dataDir)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as OwnerAuthState
}

/** True once the reset script has generated owner credentials. */
export function isOwnerConfigured (dataDir: string): boolean {
  return existsSync(ownerAuthPath(dataDir))
}

/**
 * Verify a candidate password against the stored Argon2id hash. Returns false
 * (never throws) when owner auth is not configured.
 */
export async function verifyOwnerPassword (dataDir: string, password: string): Promise<boolean> {
  const owner = readOwnerAuth(dataDir)
  if (owner === null) return false
  return await verify(owner.password.hash, password)
}
