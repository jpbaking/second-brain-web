import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'

export function buildApp (): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  })

  app.get('/api/health', async () => {
    return { status: 'ok' }
  })

  return app
}
