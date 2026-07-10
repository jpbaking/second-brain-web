import { decryptSecret, secretsKeyConfigured } from '../secrets/crypto.js'
import { getDefaultProfile, getProfile, getProfileSecret } from './store.js'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Provider snapshot (phase-004 Provider And Model Selection). A chat session
 * captures the resolved provider at start so a later edit to the profile cannot
 * change a run mid-flight. Unlike the masked view, the snapshot carries the
 * decrypted key — it lives only in memory and never reaches the browser.
 */

export interface ProviderSnapshot {
  profileId: string
  displayName: string
  providerId: string
  modelId: string
  baseUrl: string | null
  headers: Record<string, string> | null
  apiKey: string | null
}

function snapshotFor (
  db: DatabaseSync,
  profile: NonNullable<ReturnType<typeof getProfile>>,
  env: NodeJS.ProcessEnv
): ProviderSnapshot {
  let apiKey: string | null = null
  const secret = getProfileSecret(db, profile.id)
  if (secret !== undefined) {
    if (!secretsKeyConfigured(env)) {
      throw new Error(
        'A provider key is stored but SECOND_BRAIN_WEB_SECRETS_KEY is not set, so it cannot be decrypted.'
      )
    }
    apiKey = decryptSecret(secret.ciphertext, env)
  }
  return {
    profileId: profile.id,
    displayName: profile.displayName,
    providerId: profile.providerId,
    modelId: profile.modelId,
    baseUrl: profile.baseUrl,
    headers: profile.headers,
    apiKey,
  }
}

/** Snapshot the enabled default profile, or undefined when none is set. */
export function resolveDefaultSnapshot (db: DatabaseSync, env: NodeJS.ProcessEnv = process.env): ProviderSnapshot | undefined {
  const profile = getDefaultProfile(db)
  if (profile === undefined) return undefined
  return snapshotFor(db, profile, env)
}

/** Snapshot a specific profile by id, or undefined when it does not exist. */
export function resolveSnapshot (db: DatabaseSync, id: string, env: NodeJS.ProcessEnv = process.env): ProviderSnapshot | undefined {
  const profile = getProfile(db, id)
  if (profile === undefined) return undefined
  return snapshotFor(db, profile, env)
}
