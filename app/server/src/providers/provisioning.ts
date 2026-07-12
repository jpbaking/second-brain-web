import { readFileSync, statSync } from 'node:fs'
import { parse } from 'yaml'
import { extendError } from 'error-extender'
import { openCoreDb } from '../db.js'
import { AppError, asError } from '../errors.js'
import { getAppLogger } from '../logging.js'
import { secretsKeyConfigured } from '../secrets/crypto.js'

const PROFILE_ID = /^[a-z][a-z0-9-]*$/
const KNOWN_PROVIDERS = new Set(['anthropic', 'claude-code', 'gemini', 'openai', 'openai-compatible'])
const PROFILE_FIELDS = new Set(['display_name', 'provider', 'model', 'base_url', 'key', 'enabled'])

interface ProvisionedProfile {
  id: string
  displayName: string
  providerId: string
  modelId: string
  baseUrl: string | null
  keyCiphertext: string | null
  enabled: boolean
}

export const ProviderProvisioningError = extendError('ProviderProvisioningError', { parent: AppError })
const logger = getAppLogger('providers.provisioning')

function objectMap (value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProviderProvisioningError({ message: `${label} must be a map.` })
  }
  return value as Record<string, unknown>
}

function requiredString (value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProviderProvisioningError({ message: `${label} must be a non-empty string.` })
  }
  return value.trim()
}

function optionalString (value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value, label)
}

function parseProfiles (source: string): ProvisionedProfile[] {
  let document: unknown
  try {
    document = parse(source)
  } catch (err) {
    throw new ProviderProvisioningError({
      message: 'could not parse providers YAML.',
      cause: asError(err),
    })
  }
  if (document === null || document === undefined) return []

  const root = objectMap(document, 'providers file')
  const unknownRoot = Object.keys(root).filter(key => key !== 'providers')
  if (unknownRoot.length > 0) {
    throw new ProviderProvisioningError({ message: `unknown top-level field: ${unknownRoot[0]}` })
  }
  if (root.providers === undefined || root.providers === null) return []
  const providerMap = objectMap(root.providers, 'providers')

  return Object.entries(providerMap).map(([id, raw]) => {
    if (!PROFILE_ID.test(id)) {
      throw new ProviderProvisioningError({ message: `provider id "${id}" must match [a-z][a-z0-9-]*.` })
    }
    const entry = objectMap(raw, `provider "${id}"`)
    const unknown = Object.keys(entry).filter(key => !PROFILE_FIELDS.has(key))
    if (unknown.length > 0) {
      throw new ProviderProvisioningError({ message: `provider "${id}" has unknown field: ${unknown[0]}` })
    }
    const providerId = requiredString(entry.provider, `provider "${id}" provider`)
    if (!KNOWN_PROVIDERS.has(providerId)) {
      throw new ProviderProvisioningError({ message: `provider "${id}" has unknown provider type "${providerId}".` })
    }
    const baseUrl = optionalString(entry.base_url, `provider "${id}" base_url`)
    if (baseUrl !== undefined && !/^https?:\/\//.test(baseUrl)) {
      throw new ProviderProvisioningError({ message: `provider "${id}" base_url must be an http(s) URL.` })
    }
    if (providerId === 'openai-compatible' && baseUrl === undefined) {
      throw new ProviderProvisioningError({ message: `provider "${id}" needs base_url for openai-compatible.` })
    }
    const key = optionalString(entry.key, `provider "${id}" key`)
    if (providerId === 'claude-code' && key !== undefined) {
      throw new ProviderProvisioningError({ message: `provider "${id}" uses container CLI authentication and must not contain a key.` })
    }
    if (key !== undefined && !key.startsWith('v1:')) {
      throw new ProviderProvisioningError({
        message: `provider "${id}" key must be v1: ciphertext; run ./configure to encrypt it.`,
      })
    }
    if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') {
      throw new ProviderProvisioningError({ message: `provider "${id}" enabled must be a boolean.` })
    }
    return {
      id,
      displayName: optionalString(entry.display_name, `provider "${id}" display_name`) ?? id,
      providerId,
      modelId: requiredString(entry.model, `provider "${id}" model`),
      baseUrl: baseUrl ?? null,
      keyCiphertext: key ?? null,
      enabled: entry.enabled !== false
    }
  })
}

function loadProfiles (file: string | undefined, warn: (message: string) => void): ProvisionedProfile[] {
  if (file === undefined || file.trim() === '') return []
  try {
    if (statSync(file).isDirectory()) {
      warn(`provider configuration path is a directory; treating it as absent: ${file}`)
      return []
    }
    return parseProfiles(readFileSync(file, 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    if (err instanceof ProviderProvisioningError) throw err
    throw new ProviderProvisioningError({
      message: `could not read providers file ${file}.`,
      cause: asError(err),
    })
  }
}

export function provisionProviderProfiles (
  dataDir: string,
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = message => logger.warn(message)
): void {
  const profiles = loadProfiles(env.SECOND_BRAIN_WEB_PROVIDERS_FILE, warn)
  if (profiles.some(profile => profile.keyCiphertext !== null) && !secretsKeyConfigured(env)) {
    throw new ProviderProvisioningError({
      message: 'SECOND_BRAIN_WEB_SECRETS_KEY is required when providers.yaml contains encrypted keys.',
    })
  }

  const firstEnabled = profiles.find(profile => profile.enabled)?.id
  const db = openCoreDb(dataDir)
  try {
    db.exec('BEGIN IMMEDIATE')
    db.prepare('DELETE FROM provider_profiles').run()
    const insert = db.prepare(`
      INSERT INTO provider_profiles
        (id, display_name, provider_id, model_id, base_url, headers_json, config_json,
         enabled, is_default, key_ciphertext, key_last4, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, ?, ?)
    `)
    const epoch = Date.now()
    profiles.forEach((profile, index) => {
      const timestamp = new Date(epoch + index).toISOString()
      insert.run(
        profile.id, profile.displayName, profile.providerId, profile.modelId,
        profile.baseUrl, profile.enabled ? 1 : 0, profile.id === firstEnabled ? 1 : 0,
        profile.keyCiphertext, timestamp, timestamp
      )
    })
    db.exec('COMMIT')
  } catch (err) {
    try { db.exec('ROLLBACK') } catch {}
    throw err
  } finally {
    db.close()
  }
}
