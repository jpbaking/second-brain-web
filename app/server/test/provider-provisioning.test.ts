import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import {
  ProviderProvisioningError,
  provisionProviderProfiles
} from '../src/providers/provisioning.js'
import { createProfile, getProfileSecret, listProfiles } from '../src/providers/store.js'

const scratch: string[] = []

function fixture () {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-provision-'))
  scratch.push(root)
  const dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dataDir)
  const file = path.join(root, 'providers.yaml')
  return { dataDir, file }
}

function provision (dataDir: string, file: string, source: string, secretsKey?: string): void {
  writeFileSync(file, source)
  provisionProviderProfiles(dataDir, {
    SECOND_BRAIN_WEB_PROVIDERS_FILE: file,
    ...(secretsKey !== undefined ? { SECOND_BRAIN_WEB_SECRETS_KEY: secretsKey } : {})
  })
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('provider YAML provisioning', () => {
  it('preserves document order and makes the first enabled entry default', () => {
    const { dataDir, file } = fixture()
    provision(dataDir, file, `providers:
  disabled-first:
    provider: openai
    model: gpt-disabled
    enabled: false
  local:
    display_name: Local model
    provider: openai-compatible
    model: local-model
    base_url: http://localhost:1234/v1
  claude:
    provider: anthropic
    model: claude-model
`)

    let db = openCoreDb(dataDir)
    expect(listProfiles(db).map(profile => profile.id)).toEqual(['disabled-first', 'local', 'claude'])
    expect(listProfiles(db).find(profile => profile.isDefault)?.id).toBe('local')
    db.close()

    provision(dataDir, file, `providers:
  claude:
    provider: anthropic
    model: claude-model
  local:
    provider: openai-compatible
    model: local-model
    base_url: http://localhost:1234/v1
`)
    db = openCoreDb(dataDir)
    expect(listProfiles(db).map(profile => profile.id)).toEqual(['claude', 'local'])
    expect(listProfiles(db).find(profile => profile.isDefault)?.id).toBe('claude')
    db.close()
  })

  it('full-replaces profiles and stores YAML ciphertext without last-four metadata', () => {
    const { dataDir, file } = fixture()
    const db = openCoreDb(dataDir)
    createProfile(db, { displayName: 'Old UI profile', providerId: 'openai', modelId: 'old' })
    db.close()

    provision(dataDir, file, `providers:
  openai:
    provider: openai
    model: gpt-model
    key: v1:nonce:tag:ciphertext
`, 'master-key')

    const rebuilt = openCoreDb(dataDir)
    expect(listProfiles(rebuilt)).toHaveLength(1)
    expect(listProfiles(rebuilt)[0]).toMatchObject({ id: 'openai', hasKey: true, keyLast4: null })
    expect(getProfileSecret(rebuilt, 'openai')).toEqual({ ciphertext: 'v1:nonce:tag:ciphertext', last4: null })
    rebuilt.close()
  })

  it('provisions Claude Code without API key material', () => {
    const { dataDir, file } = fixture()
    provision(dataDir, file, `providers:
  claude-subscription:
    display_name: Claude subscription
    provider: claude-code
    model: sonnet
`)
    const db = openCoreDb(dataDir)
    expect(listProfiles(db)[0]).toMatchObject({
      id: 'claude-subscription', providerId: 'claude-code', modelId: 'sonnet', hasKey: false
    })
    db.close()
  })

  it('treats unset, missing, empty, and directory paths as zero providers', () => {
    const { dataDir, file } = fixture()
    provisionProviderProfiles(dataDir, {})
    provisionProviderProfiles(dataDir, { SECOND_BRAIN_WEB_PROVIDERS_FILE: file })
    writeFileSync(file, '')
    provisionProviderProfiles(dataDir, { SECOND_BRAIN_WEB_PROVIDERS_FILE: file })
    rmSync(file)
    mkdirSync(file)
    const warnings: string[] = []
    provisionProviderProfiles(dataDir, { SECOND_BRAIN_WEB_PROVIDERS_FILE: file }, message => warnings.push(message))

    const db = openCoreDb(dataDir)
    expect(listProfiles(db)).toEqual([])
    expect(warnings[0]).toContain('is a directory')
    db.close()
  })

  it.each([
    ['invalid id', 'providers:\n  Invalid_Id:\n    provider: openai\n    model: gpt\n', 'must match'],
    ['unknown provider', 'providers:\n  profile:\n    provider: unknown\n    model: m\n', 'unknown provider type'],
    ['missing model', 'providers:\n  profile:\n    provider: openai\n', 'model must be'],
    ['missing compatible URL', 'providers:\n  profile:\n    provider: openai-compatible\n    model: m\n', 'needs base_url'],
    ['plaintext key', 'providers:\n  profile:\n    provider: openai\n    model: m\n    key: plaintext\n', 'run ./configure'],
    ['Claude Code key', 'providers:\n  profile:\n    provider: claude-code\n    model: sonnet\n    key: v1:ciphertext\n', 'must not contain a key'],
    ['non-boolean enabled', 'providers:\n  profile:\n    provider: openai\n    model: m\n    enabled: yes\n', 'enabled must be a boolean'],
    ['unknown field', 'providers:\n  profile:\n    provider: openai\n    model: m\n    default: true\n', 'unknown field']
  ])('rejects %s', (_label, source, message) => {
    const { dataDir, file } = fixture()
    expect(() => provision(dataDir, file, source)).toThrow(message)
  })

  it('requires the secrets key when any profile has ciphertext', () => {
    const { dataDir, file } = fixture()
    expect(() => provision(dataDir, file, `providers:
  keyed:
    provider: gemini
    model: gemini-model
    key: v1:nonce:tag:ciphertext
`)).toThrow(ProviderProvisioningError)
  })
})
