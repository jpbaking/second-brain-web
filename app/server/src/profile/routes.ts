import { openCoreDb } from '../db.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'
import { getProfile, updateProfile, type PrincipalProfile } from './store.js'

export function registerProfileRoutes (app: FastifyInstance, config: AppConfig): void {
  app.get('/api/profile', async () => {
    const db = openCoreDb(config.dataDir)
    try {
      return getProfile(db)
    } finally {
      db.close()
    }
  })

  app.put('/api/profile', async (req, reply) => {
    const body = (req.body ?? {}) as Partial<PrincipalProfile>
    const db = openCoreDb(config.dataDir)
    try {
      const updated = updateProfile(db, body)
      return updated
    } finally {
      db.close()
    }
  })
}
