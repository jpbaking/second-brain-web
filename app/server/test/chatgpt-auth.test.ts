import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { AppError } from '../src/errors.js'
import { createProfile, getProfileSecret } from '../src/providers/store.js'
import { decryptSecret, encryptSecret } from '../src/secrets/crypto.js'
import { ChatGptAuthError, chatGptCredentialsBlob, freshenChatGptProfileSecret } from '../src/providers/chatgpt-auth.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []
const SECRETS = { SECOND_BRAIN_WEB_SECRETS_KEY: 'chatgpt-auth-test-key' }

function freshDb (): DatabaseSync {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-cgpt-'))
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

const CREDS = { access: 'at-old', refresh: 'rt-old', expires: 1893456000000, accountId: 'acc-1' }

function chatgptProfile (db: DatabaseSync, blob: string = chatGptCredentialsBlob(CREDS)): string {
  return createProfile(db, {
    displayName: 'ChatGPT',
    providerId: 'chatgpt',
    modelId: 'gpt-5.1-codex',
    keyCiphertext: encryptSecret(blob, SECRETS),
    isDefault: true,
  })
}

describe('freshenChatGptProfileSecret', () => {
  it('persists a rotated blob when the refresher returns new tokens', async () => {
    const db = freshDb()
    const id = chatgptProfile(db)
    const rotated = { access: 'at-new', refresh: 'rt-new', expires: 1893456999000, accountId: 'acc-1' }
    let seen: unknown
    await freshenChatGptProfileSecret(db, id, SECRETS, async current => {
      seen = current
      return rotated
    })
    expect(seen).toEqual(CREDS)
    const stored = getProfileSecret(db, id)
    expect(stored).toBeDefined()
    expect(JSON.parse(decryptSecret((stored as { ciphertext: string }).ciphertext, SECRETS))).toEqual(rotated)
  })

  it('leaves the stored blob untouched when tokens are still fresh', async () => {
    const db = freshDb()
    const id = chatgptProfile(db)
    const before = getProfileSecret(db, id)
    await freshenChatGptProfileSecret(db, id, SECRETS, async current => current)
    expect(getProfileSecret(db, id)).toEqual(before)
  })

  it('throws a typed error when the refresh token has expired', async () => {
    const db = freshDb()
    const id = chatgptProfile(db)
    const attempt = freshenChatGptProfileSecret(db, id, SECRETS, async () => null)
    await expect(attempt).rejects.toBeInstanceOf(ChatGptAuthError)
    await expect(freshenChatGptProfileSecret(db, id, SECRETS, async () => null))
      .rejects.toThrow(/expired/)
  })

  it('wraps refresher failures with the profile id and cause', async () => {
    const db = freshDb()
    const id = chatgptProfile(db)
    const failure = freshenChatGptProfileSecret(db, id, SECRETS, async () => {
      throw new Error('network down')
    })
    await expect(failure).rejects.toBeInstanceOf(AppError)
    await expect(freshenChatGptProfileSecret(db, id, SECRETS, async () => {
      throw new Error('network down')
    })).rejects.toThrow(/could not refresh/)
  })

  it('throws when the profile has no stored credentials', async () => {
    const db = freshDb()
    const id = createProfile(db, {
      displayName: 'ChatGPT keyless', providerId: 'chatgpt', modelId: 'gpt-5.1-codex', isDefault: true,
    })
    await expect(freshenChatGptProfileSecret(db, id, SECRETS, async current => current))
      .rejects.toThrow(/no stored credentials/)
  })

  it('rejects a malformed stored blob with a re-login hint', async () => {
    const db = freshDb()
    const id = chatgptProfile(db, 'not-json')
    await expect(freshenChatGptProfileSecret(db, id, SECRETS, async current => current))
      .rejects.toThrow(/run \.\/configure/)
  })
})
