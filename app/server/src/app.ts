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
import type { AgentRunner } from './agent/runner.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// server/src (tsx) and server/dist (built) are both one level below server/.
const webDist = path.resolve(here, '../../web/dist')

/** Test/embedding seam: override the agent runner (defaults to the live Cline SDK). */
export interface AppDeps {
  agentRunner?: AgentRunner
  /** Capture structured logs (tests); defaults to stdout in non-test envs. */
  logStream?: { write: (line: string) => void }
}

/**
 * Structured (JSON) logging config. Fastify/pino already emits JSON and its
 * default request serializer logs only method/url/host/remote address — never
 * headers or bodies — so credentials in a login body or the session cookie are
 * not logged. `redact` is defence-in-depth: if a serializer ever changes to
 * include headers, the cookie and authorization values are stripped.
 */
function loggerOptions (stream?: { write: (line: string) => void }): Record<string, unknown> {
  return {
    redact: { paths: ['req.headers.cookie', 'req.headers.authorization'], remove: true },
    ...(stream !== undefined ? { stream } : {}),
  }
}

export function buildApp (config?: AppConfig, deps?: AppDeps): FastifyInstance {
  // Quiet by default under test, unless a stream is injected to assert logging.
  const logger = process.env.NODE_ENV === 'test' && deps?.logStream === undefined
    ? false
    : loggerOptions(deps?.logStream)
  const app = Fastify({ logger })

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
    registerReportRoutes(app, config)
    registerFollowUpRoutes(app, config)
    registerSearchRoutes(app, config)
    registerExplorerRoutes(app, config)
    registerSystemRoutes(app, config)
    registerProfileRoutes(app, config)
    const agentService = registerChatRoutes(app, config, deps?.agentRunner ?? new ClineAgentRunner(config.dataDir))
    registerScheduleRoutes(app, config)
    const scheduler = new SchedulerService(config, agentService)
    scheduler.start()
    app.addHook('onClose', () => { scheduler.stop() })

    registerCaptureRoutes(app, agentService)
    registerUploadRoutes(app, config, agentService)
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
