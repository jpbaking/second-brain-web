import { openCoreDb, openSidecarDb } from '../db.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

export function registerSystemRoutes (app: FastifyInstance, config: AppConfig): void {
  app.get('/api/backup/:db', async (req, reply) => {
    const dbName = (req.params as { db: string }).db
    if (dbName !== 'core' && dbName !== 'sidecar') {
      return await reply.code(400).send({ error: 'invalid database name' })
    }

    const openDb = dbName === 'core' ? openCoreDb : openSidecarDb
    const db = openDb(config.dataDir)
    try {
      const buffer = db.serialize()
      return await reply
        .header('Content-Type', 'application/x-sqlite3')
        .header('Content-Disposition', `attachment; filename="app-${dbName}.db"`)
        .send(buffer)
    } catch (err) {
      return await reply.code(500).send({ error: 'failed to serialize database' })
    } finally {
      db.close()
    }
  })
}
