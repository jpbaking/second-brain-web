import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { encryptSecret, secretLast4 } from '../src/secrets/crypto.js'
import {
  createProfile,
  deleteProfile,
  getDefaultProfile,
  getProfile,
  getProfileSecret,
  listProfiles,
  setDefaultProfile,
  updateProfile,
} from '../src/providers/store.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []
const ENV = { SECOND_BRAIN_WEB_SECRETS_KEY: 'test-secret-key' }

function coreDb (): DatabaseSync {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-provstore-'))
  scratch.push(root)
  const dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dataDir)
  const db = openCoreDb(dataDir)
  dbs.push(db)
  return db
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('provider store', () => {
  it('creates a profile storing the key only as ciphertext + last4', () => {
    const db = coreDb()
    const key = 'sk-anthropic-secret-1234'
    const id = createProfile(db, {
      displayName: 'Claude',
      providerId: 'anthropic',
      modelId: 'claude-sonnet-5',
      keyCiphertext: encryptSecret(key, ENV),
      keyLast4: secretLast4(key),
    })

    const view = getProfile(db, id)
    expect(view).toMatchObject({ displayName: 'Claude', providerId: 'anthropic', hasKey: true, keyLast4: '1234' })
    // The masked view exposes no key material.
    expect(JSON.stringify(view)).not.toContain(key)

    // The raw row stores ciphertext, not the plaintext key.
    const row = db.prepare('SELECT key_ciphertext FROM provider_profiles WHERE id = ?').get(id) as { key_ciphertext: string }
    expect(row.key_ciphertext).not.toContain(key)
    expect(getProfileSecret(db, id)?.ciphertext).toBe(row.key_ciphertext)
  })

  it('updates fields and rotates the key only when provided', () => {
    const db = coreDb()
    const id = createProfile(db, { displayName: 'A', providerId: 'openai', modelId: 'gpt', keyCiphertext: 'ct1', keyLast4: 'aaaa' })
    updateProfile(db, id, { displayName: 'B', modelId: 'gpt-2' })
    expect(getProfile(db, id)).toMatchObject({ displayName: 'B', modelId: 'gpt-2', keyLast4: 'aaaa' })
    updateProfile(db, id, { keyCiphertext: 'ct2', keyLast4: 'bbbb' })
    expect(getProfileSecret(db, id)?.ciphertext).toBe('ct2')
    expect(getProfile(db, id)?.keyLast4).toBe('bbbb')
  })

  it('enforces a single default', () => {
    const db = coreDb()
    const a = createProfile(db, { displayName: 'A', providerId: 'openai', modelId: 'm', isDefault: true })
    const b = createProfile(db, { displayName: 'B', providerId: 'openai', modelId: 'm' })
    expect(getDefaultProfile(db)?.id).toBe(a)
    expect(setDefaultProfile(db, b)).toBe(true)
    expect(getDefaultProfile(db)?.id).toBe(b)
    expect(getProfile(db, a)?.isDefault).toBe(false)
  })

  it('lists and deletes profiles', () => {
    const db = coreDb()
    const id = createProfile(db, { displayName: 'A', providerId: 'openai', modelId: 'm' })
    expect(listProfiles(db)).toHaveLength(1)
    expect(deleteProfile(db, id)).toBe(true)
    expect(listProfiles(db)).toHaveLength(0)
  })

  it('does not treat a disabled default as the active default', () => {
    const db = coreDb()
    const id = createProfile(db, { displayName: 'A', providerId: 'openai', modelId: 'm', isDefault: true })
    updateProfile(db, id, { enabled: false })
    expect(getDefaultProfile(db)).toBeUndefined()
  })
})
