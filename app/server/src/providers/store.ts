import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Provider profile store (phase-004 Provider And Model Selection). A profile is
 * the unit a chat session runs with. The API key is persisted only as
 * ciphertext plus a masked last-4; the plaintext key never lives in a row and
 * the ciphertext is exposed only to the snapshot/test paths, never to listings.
 */

export interface ProviderProfileView {
  id: string
  displayName: string
  providerId: string
  modelId: string
  baseUrl: string | null
  headers: Record<string, string> | null
  config: Record<string, unknown> | null
  enabled: boolean
  isDefault: boolean
  keyLast4: string | null
  hasKey: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateProfileInput {
  displayName: string
  providerId: string
  modelId: string
  baseUrl?: string | null
  headers?: Record<string, string> | null
  config?: Record<string, unknown> | null
  enabled?: boolean
  isDefault?: boolean
  keyCiphertext?: string | null
  keyLast4?: string | null
}

export interface UpdateProfileInput {
  displayName?: string
  providerId?: string
  modelId?: string
  baseUrl?: string | null
  headers?: Record<string, string> | null
  config?: Record<string, unknown> | null
  enabled?: boolean
  /** Provide both to rotate the key; omit both to leave the key unchanged. */
  keyCiphertext?: string | null
  keyLast4?: string | null
}

interface ProfileRow {
  id: string
  display_name: string
  provider_id: string
  model_id: string
  base_url: string | null
  headers_json: string | null
  config_json: string | null
  enabled: number
  is_default: number
  key_ciphertext: string | null
  key_last4: string | null
  created_at: string
  updated_at: string
}

function parseJson<T> (raw: string | null): T | null {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function toView (row: ProfileRow): ProviderProfileView {
  return {
    id: row.id,
    displayName: row.display_name,
    providerId: row.provider_id,
    modelId: row.model_id,
    baseUrl: row.base_url,
    headers: parseJson<Record<string, string>>(row.headers_json),
    config: parseJson<Record<string, unknown>>(row.config_json),
    enabled: row.enabled === 1,
    isDefault: row.is_default === 1,
    keyLast4: row.key_last4,
    hasKey: row.key_ciphertext !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowById (db: DatabaseSync, id: string): ProfileRow | undefined {
  return db.prepare('SELECT * FROM provider_profiles WHERE id = ?').get(id) as ProfileRow | undefined
}

export function listProfiles (db: DatabaseSync): ProviderProfileView[] {
  const rows = db.prepare('SELECT * FROM provider_profiles ORDER BY created_at').all() as unknown as ProfileRow[]
  return rows.map(toView)
}

export function getProfile (db: DatabaseSync, id: string): ProviderProfileView | undefined {
  const row = rowById(db, id)
  return row === undefined ? undefined : toView(row)
}

/** Internal: the encrypted key for a profile, for snapshot/test only. */
export function getProfileSecret (db: DatabaseSync, id: string): { ciphertext: string, last4: string | null } | undefined {
  const row = rowById(db, id)
  if (row?.key_ciphertext == null) return undefined
  return { ciphertext: row.key_ciphertext, last4: row.key_last4 }
}

function clearDefaults (db: DatabaseSync): void {
  db.prepare('UPDATE provider_profiles SET is_default = 0 WHERE is_default = 1').run()
}

export function createProfile (db: DatabaseSync, input: CreateProfileInput, now: Date = new Date()): string {
  const id = randomUUID()
  const iso = now.toISOString()
  const isDefault = input.isDefault === true
  if (isDefault) clearDefaults(db)

  db.prepare(`
    INSERT INTO provider_profiles
      (id, display_name, provider_id, model_id, base_url, headers_json, config_json,
       enabled, is_default, key_ciphertext, key_last4, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.displayName,
    input.providerId,
    input.modelId,
    input.baseUrl ?? null,
    input.headers != null ? JSON.stringify(input.headers) : null,
    input.config != null ? JSON.stringify(input.config) : null,
    input.enabled === false ? 0 : 1,
    isDefault ? 1 : 0,
    input.keyCiphertext ?? null,
    input.keyLast4 ?? null,
    iso,
    iso
  )
  return id
}

export function updateProfile (db: DatabaseSync, id: string, patch: UpdateProfileInput, now: Date = new Date()): boolean {
  const row = rowById(db, id)
  if (row === undefined) return false

  const rotateKey = patch.keyCiphertext !== undefined
  db.prepare(`
    UPDATE provider_profiles SET
      display_name = ?, provider_id = ?, model_id = ?, base_url = ?,
      headers_json = ?, config_json = ?, enabled = ?,
      key_ciphertext = ?, key_last4 = ?, updated_at = ?
    WHERE id = ?
  `).run(
    patch.displayName ?? row.display_name,
    patch.providerId ?? row.provider_id,
    patch.modelId ?? row.model_id,
    patch.baseUrl !== undefined ? patch.baseUrl : row.base_url,
    patch.headers !== undefined ? (patch.headers != null ? JSON.stringify(patch.headers) : null) : row.headers_json,
    patch.config !== undefined ? (patch.config != null ? JSON.stringify(patch.config) : null) : row.config_json,
    patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : row.enabled,
    rotateKey ? (patch.keyCiphertext ?? null) : row.key_ciphertext,
    rotateKey ? (patch.keyLast4 ?? null) : row.key_last4,
    now.toISOString(),
    id
  )
  return true
}

export function deleteProfile (db: DatabaseSync, id: string): boolean {
  return Number(db.prepare('DELETE FROM provider_profiles WHERE id = ?').run(id).changes) > 0
}

/** Make a profile the single default. Returns false if it does not exist. */
export function setDefaultProfile (db: DatabaseSync, id: string): boolean {
  if (rowById(db, id) === undefined) return false
  clearDefaults(db)
  db.prepare('UPDATE provider_profiles SET is_default = 1 WHERE id = ?').run(id)
  return true
}

/** The enabled default profile, if any. */
export function getDefaultProfile (db: DatabaseSync): ProviderProfileView | undefined {
  const row = db.prepare('SELECT * FROM provider_profiles WHERE is_default = 1 AND enabled = 1')
    .get() as ProfileRow | undefined
  return row === undefined ? undefined : toView(row)
}
