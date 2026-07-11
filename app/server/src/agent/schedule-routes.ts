import { openCoreDb } from '../db.js'
import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

export interface ScheduledJob {
  id: string
  name: string
  workflow: string
  frequency: string
  last_run_at: string | null
  created_at: string
}

export function registerScheduleRoutes (app: FastifyInstance, config: AppConfig): void {
  app.get('/api/schedules', async () => {
    const db = openCoreDb(config.dataDir)
    try {
      const rows = db.prepare('SELECT * FROM scheduled_jobs ORDER BY created_at DESC').all()
      return { schedules: rows }
    } finally {
      db.close()
    }
  })

  app.post('/api/schedules', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string, workflow?: string, frequency?: string }
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return await reply.code(400).send({ error: 'name is required' })
    }
    if (typeof body.workflow !== 'string' || body.workflow.trim() === '') {
      return await reply.code(400).send({ error: 'workflow is required' })
    }
    if (body.frequency !== 'hourly' && body.frequency !== 'daily' && body.frequency !== 'weekly') {
      return await reply.code(400).send({ error: 'frequency must be hourly, daily, or weekly' })
    }
    
    const db = openCoreDb(config.dataDir)
    try {
      const id = randomUUID()
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO scheduled_jobs (id, name, workflow, frequency, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, body.name.trim(), body.workflow.trim(), body.frequency, now)
      
      const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id)
      return await reply.code(201).send(job)
    } finally {
      db.close()
    }
  })

  app.delete('/api/schedules/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const db = openCoreDb(config.dataDir)
    try {
      const info = db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(id)
      if (info.changes === 0) return await reply.code(404).send({ error: 'schedule not found' })
      return { ok: true }
    } finally {
      db.close()
    }
  })
}
