import { openCoreDb } from '../db.js'
import { decryptSecret, encryptSecret, secretLast4, secretsKeyConfigured } from '../secrets/crypto.js'
import {
  createProfile,
  deleteProfile,
  getProfile,
  getProfileSecret,
  listProfiles,
  setDefaultProfile,
  updateProfile,
} from './store.js'
import { testProvider } from './test.js'
import type { AppConfig } from '../config.js'
import type { CreateProfileInput, UpdateProfileInput } from './store.js'
import type { FastifyInstance } from 'fastify'

const KNOWN_PROVIDERS = new Set(['anthropic', 'gemini', 'openai', 'openai-compatible'])

interface ProviderBody {
  displayName?: unknown
  providerId?: unknown
  modelId?: unknown
  baseUrl?: unknown
  enabled?: unknown
  isDefault?: unknown
  apiKey?: unknown
}

function str (value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function validBaseUrl (value: string): boolean {
  return /^https?:\/\//.test(value) && value.length <= 512
}

/**
 * Provider settings CRUD (phase-004 / phase-002). Guarded by the auth guard.
 * API keys are encrypted with SECOND_BRAIN_WEB_SECRETS_KEY before storage and
 * never returned to the browser — responses carry masked views only.
 */
export function registerProviderRoutes (app: FastifyInstance, config: AppConfig): void {
  const secretsEnv = { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey }

  app.get('/api/providers', async () => {
    const db = openCoreDb(config.dataDir)
    try {
      return { profiles: listProfiles(db), secretStorage: secretsKeyConfigured(secretsEnv) }
    } finally {
      db.close()
    }
  })

  app.post('/api/providers', async (req, reply) => {
    const body = (req.body ?? {}) as ProviderBody
    const displayName = str(body.displayName)
    const providerId = str(body.providerId)
    const modelId = str(body.modelId)
    if (displayName === undefined || providerId === undefined || modelId === undefined) {
      return await reply.code(400).send({ error: 'displayName, providerId, and modelId are required' })
    }
    if (!KNOWN_PROVIDERS.has(providerId)) {
      return await reply.code(400).send({ error: `unknown providerId (expected one of: ${[...KNOWN_PROVIDERS].join(', ')})` })
    }
    const baseUrl = str(body.baseUrl)
    if (baseUrl !== undefined && !validBaseUrl(baseUrl)) {
      return await reply.code(400).send({ error: 'baseUrl must be an http(s) URL' })
    }
    if (providerId === 'openai-compatible' && baseUrl === undefined) {
      return await reply.code(400).send({ error: 'openai-compatible providers need a baseUrl' })
    }

    const apiKey = str(body.apiKey)
    const input: CreateProfileInput = {
      displayName,
      providerId,
      modelId,
      baseUrl: baseUrl ?? null,
      enabled: body.enabled !== false,
      isDefault: body.isDefault === true,
    }
    if (apiKey !== undefined) {
      if (!secretsKeyConfigured(secretsEnv)) {
        return await reply.code(400).send({
          error: 'SECOND_BRAIN_WEB_SECRETS_KEY is not set on the host, so API keys cannot be stored. Set it and try again.',
        })
      }
      input.keyCiphertext = encryptSecret(apiKey, secretsEnv)
      input.keyLast4 = secretLast4(apiKey)
    }

    const db = openCoreDb(config.dataDir)
    try {
      const id = createProfile(db, input)
      return await reply.code(201).send(getProfile(db, id))
    } finally {
      db.close()
    }
  })

  app.put('/api/providers/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const body = (req.body ?? {}) as ProviderBody
    const patch: UpdateProfileInput = {}

    const displayName = str(body.displayName)
    if (displayName !== undefined) patch.displayName = displayName
    const modelId = str(body.modelId)
    if (modelId !== undefined) patch.modelId = modelId
    if (body.providerId !== undefined) {
      const providerId = str(body.providerId)
      if (providerId === undefined || !KNOWN_PROVIDERS.has(providerId)) {
        return await reply.code(400).send({ error: 'invalid providerId' })
      }
      patch.providerId = providerId
    }
    if (body.baseUrl !== undefined) {
      const baseUrl = str(body.baseUrl)
      if (baseUrl !== undefined && !validBaseUrl(baseUrl)) {
        return await reply.code(400).send({ error: 'baseUrl must be an http(s) URL' })
      }
      patch.baseUrl = baseUrl ?? null
    }
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled

    const apiKey = str(body.apiKey)
    if (apiKey !== undefined) {
      if (!secretsKeyConfigured(secretsEnv)) {
        return await reply.code(400).send({ error: 'SECOND_BRAIN_WEB_SECRETS_KEY is not set; cannot store an API key.' })
      }
      patch.keyCiphertext = encryptSecret(apiKey, secretsEnv)
      patch.keyLast4 = secretLast4(apiKey)
    }

    const db = openCoreDb(config.dataDir)
    try {
      if (!updateProfile(db, id, patch)) {
        return await reply.code(404).send({ error: 'profile not found' })
      }
      return getProfile(db, id)
    } finally {
      db.close()
    }
  })

  app.delete('/api/providers/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const db = openCoreDb(config.dataDir)
    try {
      if (!deleteProfile(db, id)) return await reply.code(404).send({ error: 'profile not found' })
      return { ok: true }
    } finally {
      db.close()
    }
  })

  app.post('/api/providers/:id/test', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const db = openCoreDb(config.dataDir)
    try {
      const profile = getProfile(db, id)
      if (profile === undefined) return await reply.code(404).send({ error: 'profile not found' })

      let apiKey: string | undefined
      const secret = getProfileSecret(db, id)
      if (secret !== undefined) {
        if (!secretsKeyConfigured(secretsEnv)) {
          return await reply.code(400).send({
            error: 'SECOND_BRAIN_WEB_SECRETS_KEY is not set on the host, so the stored API key cannot be decrypted.',
          })
        }
        apiKey = decryptSecret(secret.ciphertext, secretsEnv)
      }

      const result = await testProvider({
        providerId: profile.providerId,
        baseUrl: profile.baseUrl,
        modelId: profile.modelId,
        ...(apiKey !== undefined ? { apiKey } : {}),
      })
      return result
    } finally {
      db.close()
    }
  })

  app.post('/api/providers/:id/default', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const db = openCoreDb(config.dataDir)
    try {
      if (!setDefaultProfile(db, id)) return await reply.code(404).send({ error: 'profile not found' })
      return getProfile(db, id)
    } finally {
      db.close()
    }
  })
}
