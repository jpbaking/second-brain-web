import { openCoreDb } from '../db.js'
import { decryptSecret, secretsKeyConfigured } from '../secrets/crypto.js'
import {
  getProfile,
  getProfileSecret,
  listProfiles,
} from './store.js'
import { testProvider } from './test.js'
import { modelReasoningCapabilities } from './capabilities.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

/**
 * Read-only provider status and connectivity testing. Provider configuration
 * is rebuilt from providers.yaml at startup; no HTTP route accepts key material.
 */
export function registerProviderRoutes (app: FastifyInstance, config: AppConfig): void {
  const secretsEnv = { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey }

  app.get('/api/providers', async () => {
    const db = openCoreDb(config.dataDir)
    try {
      return {
        profiles: listProfiles(db).map(({ keyLast4: _keyLast4, hasKey, ...profile }) => ({
          ...profile,
          key: hasKey ? 'configured' : 'none',
          reasoning: modelReasoningCapabilities(profile.providerId, profile.modelId)
        }))
      }
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
}
