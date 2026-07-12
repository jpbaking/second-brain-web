import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import type { FastifyInstance } from 'fastify'
import type { AppConfig } from './config.js'
import { readSystemStatus } from './status.js'
import { registerAuthRoutes } from './auth/routes.js'
import { registerAuthGuard } from './auth/guard.js'
import { registerVaultRoutes } from './vault/routes.js'
import { registerProviderRoutes } from './providers/routes.js'
import { registerChatRoutes } from './chat/routes.js'
import { registerCaptureRoutes } from './chat/capture.js'
import { registerChatUploadRoutes } from './chat/uploads.js'
import { registerScheduleRoutes } from './agent/schedule-routes.js'
import { SchedulerService } from './agent/scheduler.js'
import { registerUploadRoutes } from './vault/upload.js'
import { registerReportRoutes } from './reports/routes.js'
import { registerFollowUpRoutes, registerFollowUpActionRoutes } from './follow-ups/routes.js'
import { registerSearchRoutes } from './search/routes.js'
import { registerExplorerRoutes } from './explorer/routes.js'
import { registerSystemRoutes } from './system/routes.js'
import { registerProfileRoutes } from './profile/routes.js'
import { ClineAgentRunner } from './agent/cline-runner.js'
import { getAppLogger } from './logging.js'
import type { AgentRunner } from './agent/runner.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// server/src (tsx) and server/dist (built) are both one level below server/.
const webDist = path.resolve(here, '../../web/dist')

/** Test/embedding seam: override the agent runner (defaults to the live Cline SDK). */
export interface AppDeps {
  agentRunner?: AgentRunner
  /** Capture structured log4js records (tests); defaults to stdout outside tests. */
  logStream?: { write: (line: string) => void }
}

export function buildApp (config?: AppConfig, deps?: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false })
  const loggingEnabled = process.env.NODE_ENV !== 'test' || deps?.logStream !== undefined
  const logger = getAppLogger('http', deps?.logStream)

  if (loggingEnabled) {
    app.addHook('onRequest', (req, _reply, done) => {
      logger.info('request received', {
        reqId: req.id,
        req: {
          method: req.method,
          url: req.url,
          host: req.host,
          remoteAddress: req.ip,
        },
      })
      done()
    })
    app.addHook('onResponse', (req, reply, done) => {
      logger.info('request completed', {
        reqId: req.id,
        res: { statusCode: reply.statusCode },
        responseTime: reply.elapsedTime,
      })
      done()
    })
    app.addHook('onError', (req, _reply, error, done) => {
      logger.error('request failed', error, { reqId: req.id })
      done()
    })
  }

  app.register(fastifyCookie)

  app.get('/api/health', async () => {
    return { status: 'ok' }
  })

  // Auth routes need the data root; without config the app is status-only.
  if (config !== undefined) {
    registerAuthGuard(app, config)
    registerAuthRoutes(app, config)
    registerVaultRoutes(app, config)
    registerProviderRoutes(app, config)
    registerFollowUpRoutes(app, config)
    registerSearchRoutes(app, config)
    registerExplorerRoutes(app, config)
    registerSystemRoutes(app, config)
    registerProfileRoutes(app, config)
    const agentService = registerChatRoutes(app, config, deps?.agentRunner ?? new ClineAgentRunner(config.dataDir))
    registerReportRoutes(app, config, agentService)
    registerScheduleRoutes(app, config)
    const scheduler = new SchedulerService(config, agentService)
    scheduler.start()
    app.addHook('onClose', () => { scheduler.stop() })

    registerCaptureRoutes(app, agentService)
    registerUploadRoutes(app, config, agentService)
    registerChatUploadRoutes(app, config)
    registerFollowUpActionRoutes(app, config, agentService)
  }

  app.get('/api/status', async (_req, reply) => {
    if (config === undefined) {
      reply.code(503)
      return { error: 'configuration unavailable' }
    }

    return readSystemStatus(config)
  })

  // Serve the built front end when it exists (production); in development
  // Vite serves the front end and proxies /api here instead.
  if (existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist })
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) {
        reply.code(404).send({ error: 'not found' })
        return
      }
      // SPA fallback
      reply.sendFile('index.html')
    })
  }

  return app
}
