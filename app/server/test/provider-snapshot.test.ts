import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { createProfile, setDefaultProfile } from '../src/providers/store.js'
import { encryptSecret } from '../src/secrets/crypto.js'
import { resolveDefaultSnapshot, resolveSnapshot } from '../src/providers/snapshot.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []
const SECRETS = { SECOND_BRAIN_WEB_SECRETS_KEY: 'snapshot-test-key' }

function freshDb (): DatabaseSync {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-snap-'))
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

describe('resolveDefaultSnapshot', () => {
  it('resolves the enabled default with its decrypted key', () => {
    const db = freshDb()
    const key = 'sk-default-1234'
    const id = createProfile(db, {
      displayName: 'Default',
      providerId: 'openai',
      modelId: 'gpt-5',
      baseUrl: 'https://api.example.com/v1',
      headers: { 'x-org': 'acme' },
      keyCiphertext: encryptSecret(key, SECRETS),
      keyLast4: '1234',
      isDefault: true,
    })

    const snap = resolveDefaultSnapshot(db, SECRETS)
    expect(snap).toMatchObject({
      profileId: id,
      providerId: 'openai',
      modelId: 'gpt-5',
      baseUrl: 'https://api.example.com/v1',
      headers: { 'x-org': 'acme' },
      apiKey: key,
    })
  })

  it('returns undefined when no default is set', () => {
    const db = freshDb()
    createProfile(db, { displayName: 'A', providerId: 'openai', modelId: 'm' })
    expect(resolveDefaultSnapshot(db, SECRETS)).toBeUndefined()
  })

  it('returns undefined when the default profile is disabled', () => {
    const db = freshDb()
    const id = createProfile(db, { displayName: 'A', providerId: 'openai', modelId: 'm', isDefault: true })
    // Disable it: getDefaultProfile requires enabled = 1.
    db.prepare('UPDATE provider_profiles SET enabled = 0 WHERE id = ?').run(id)
    expect(resolveDefaultSnapshot(db, SECRETS)).toBeUndefined()
  })

  it('snapshots a keyless profile with apiKey null (e.g. local LM Studio)', () => {
    const db = freshDb()
    createProfile(db, {
      displayName: 'Local',
      providerId: 'openai-compatible',
      modelId: 'local',
      baseUrl: 'http://127.0.0.1:1234/v1',
      isDefault: true,
    })
    const snap = resolveDefaultSnapshot(db, SECRETS)
    expect(snap?.apiKey).toBe(null)
    expect(snap?.baseUrl).toBe('http://127.0.0.1:1234/v1')
  })

  it('throws when a stored key cannot be decrypted (secrets key unset)', () => {
    const db = freshDb()
    createProfile(db, {
      displayName: 'A',
      providerId: 'openai',
      modelId: 'm',
      keyCiphertext: encryptSecret('sk-x', SECRETS),
      keyLast4: 'k-x',
      isDefault: true,
    })
    expect(() => resolveDefaultSnapshot(db, {})).toThrow(/SECOND_BRAIN_WEB_SECRETS_KEY/)
  })
})

describe('resolveSnapshot (by id)', () => {
  it('resolves a specific non-default profile', () => {
    const db = freshDb()
    const first = createProfile(db, { displayName: 'A', providerId: 'anthropic', modelId: 'claude-sonnet-5', isDefault: true })
    const second = createProfile(db, { displayName: 'B', providerId: 'openai', modelId: 'gpt-5' })
    setDefaultProfile(db, first)

    const snap = resolveSnapshot(db, second, SECRETS)
    expect(snap).toMatchObject({ profileId: second, providerId: 'openai', modelId: 'gpt-5' })
  })

  it('returns undefined for an unknown id', () => {
    const db = freshDb()
    expect(resolveSnapshot(db, 'nope', SECRETS)).toBeUndefined()
  })
})
