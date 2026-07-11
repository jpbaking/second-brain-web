import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { scanReports } from './scan.js'
import { getReportProvenance } from './store.js'
import { openCoreDb } from '../db.js'
import { vaultWorkspacePath } from '../vault/config.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'
import type { AgentSessionService } from '../agent/session.js'

const CONTENT_TYPES: Record<string, string | undefined> = {
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
}

export function registerReportRoutes (app: FastifyInstance, config: AppConfig, agentService?: AgentSessionService): void {
  const workspace = vaultWorkspacePath(config.dataDir)

  app.get('/api/reports', async () => {
    const reports = scanReports(workspace)
    const db = openCoreDb(config.dataDir)
    try {
      for (const r of reports) {
        const prov = getReportProvenance(db, r.path)
        if (prov !== undefined) {
          const { reportPath, ...rest } = prov
          r.provenance = rest
        }
      }
      return { reports }
    } finally {
      db.close()
    }
  })

  app.get('/api/reports/content/*', async (req, reply) => {
    const requested = (req.params as { '*': string })['*']
    let resolved: string
    try {
      resolved = await resolveReportPath(workspace, requested)
    } catch (error) {
      const status = error instanceof ReportPathError ? error.status : 404
      return await reply.code(status).send({ error: error instanceof Error ? error.message : 'Report not found.' })
    }
    const contentType = CONTENT_TYPES[path.extname(resolved).toLowerCase()]
    if (contentType === undefined) return await reply.code(415).send({ error: 'Unsupported report type.' })
    reply.header('content-type', contentType)
    reply.header('x-content-type-options', 'nosniff')
    if (path.extname(resolved).toLowerCase() !== '.html') {
      const filename = path.basename(resolved).replace(/["\r\n]/g, '_')
      reply.header('content-disposition', `attachment; filename="${filename}"`)
    }
    return await reply.send(createReadStream(resolved))
  })

  app.post('/api/reports/regenerate/*', async (req, reply) => {
    if (agentService === undefined) return reply.code(503).send({ error: 'Agent service not available' })

    const requested = (req.params as { '*': string })['*']
    let resolved: string
    try {
      resolved = await resolveReportPath(workspace, requested)
    } catch (error) {
      const status = error instanceof ReportPathError ? error.status : 404
      return await reply.code(status).send({ error: error instanceof Error ? error.message : 'Report not found.' })
    }

    const relative = path.relative(path.join(workspace, 'reports'), resolved).split(path.sep).join('/')
    const db = openCoreDb(config.dataDir)
    let prov
    try {
      prov = getReportProvenance(db, relative)
    } finally {
      db.close()
    }

    if (prov === undefined) {
      return await reply.code(404).send({ error: 'Report provenance not found. Cannot regenerate.' })
    }
    if (prov.prompt === null) {
      return await reply.code(400).send({ error: 'Provenance prompt is missing. Cannot regenerate.' })
    }

    const session = agentService.create({
      title: `Regenerate: ${path.basename(resolved)}`,
      providerProfileId: prov.providerProfileId
    })

    agentService.sendMessage(session.id, prov.prompt).catch(() => {})

    return await reply.send({ sessionId: session.id })
  })
}

class ReportPathError extends Error {
  constructor (message: string, readonly status: number) {
    super(message)
  }
}

export async function resolveReportPath (workspace: string, requested: string): Promise<string> {
  if (requested === '' || requested.includes('\0') || requested.includes('\\') || path.posix.isAbsolute(requested)) {
    throw new ReportPathError('Invalid report path.', 400)
  }
  const segments = requested.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new ReportPathError('Invalid report path.', 400)
  }

  const root = await realpath(path.join(workspace, 'reports')).catch(() => { throw new ReportPathError('Report shelf not found.', 404) })
  const candidate = await realpath(path.join(root, ...segments)).catch(() => { throw new ReportPathError('Report not found.', 404) })
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new ReportPathError('Report path escapes the report shelf.', 400)
  }
  const info = await stat(candidate)
  if (!info.isFile()) throw new ReportPathError('Report not found.', 404)
  return candidate
}
