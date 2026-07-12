import { openCoreDb } from '../db.js'
import { resolveDefaultSnapshot, resolveSnapshot } from '../providers/snapshot.js'
import { vaultWorkspacePath } from '../vault/config.js'
import { AgentSessionService } from '../agent/session.js'
import { deleteSessionUploads, imageDataUri, resolveAttachments } from './uploads.js'
import type { MessageAttachments } from '../agent/session.js'
import { WorkflowNotFoundError, expandWorkflow, listWorkflows } from '../agent/workflows.js'
import { closeSession, getSession, listSessions, readEventsSince, renameSession, setSessionPinned } from '../agent/chat-store.js'
import type { AgentRunner } from '../agent/runner.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

/**
 * Chat HTTP routes (milestone 5A). Guarded by the m02 auth guard (everything
 * under /api/ that is not health/status/auth). The routes drive a single
 * {@link AgentSessionService} whose in-memory live-session map must persist for
 * the app's lifetime, so the service (and its DB connection) is built once here.
 */
export function registerChatRoutes (app: FastifyInstance, config: AppConfig, runner: AgentRunner): AgentSessionService {
  const db = openCoreDb(config.dataDir)

  const secretsEnv = { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey }
  const service = new AgentSessionService(db, runner, {
    snapshotFor: (profileId) => profileId === null
      ? resolveDefaultSnapshot(db, secretsEnv)
      : resolveSnapshot(db, profileId, secretsEnv),
    vaultCwd: vaultWorkspacePath(config.dataDir),
  })
  app.addHook('onClose', () => { service.dispose(); db.close() })

  function str (value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  }

  app.get('/api/chat/sessions', async () => {
    return { sessions: listSessions(db) }
  })

  app.post('/api/chat/sessions', async (req, reply) => {
    const body = (req.body ?? {}) as { title?: unknown, providerProfileId?: unknown, approvalPreset?: unknown, pinned?: unknown }
    const title = str(body.title) ?? 'New chat'
    const providerProfileId = str(body.providerProfileId) ?? null
    const approvalPreset = (body.approvalPreset === 'read-only' || body.approvalPreset === 'high-trust') ? body.approvalPreset : 'normal'
    try {
      const session = service.create({ title, providerProfileId, approvalPreset })
      return await reply.code(201).send(session)
    } catch (err) {
      return await reply.code(400).send({ error: err instanceof Error ? err.message : 'could not create session' })
    }
  })

  app.get('/api/chat/sessions/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const session = getSession(db, id)
    if (session === undefined) return await reply.code(404).send({ error: 'session not found' })
    const afterSeq = Number((req.query as { since?: string }).since ?? 0) || 0
    return { session, events: readEventsSince(db, id, afterSeq), live: service.isLive(id) }
  })

  app.patch('/api/chat/sessions/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const body = (req.body ?? {}) as { title?: unknown, providerProfileId?: unknown, approvalPreset?: unknown, pinned?: unknown }
    const title = str(body.title)
    if (title !== undefined && !renameSession(db, id, title)) return await reply.code(404).send({ error: 'session not found' })
    if (body.providerProfileId !== undefined || body.approvalPreset !== undefined) {
      const current = getSession(db, id)
      if (current === undefined) return await reply.code(404).send({ error: 'session not found' })
      const providerProfileId = str(body.providerProfileId) ?? current.providerProfileId
      const approvalPreset = body.approvalPreset === 'read-only' || body.approvalPreset === 'high-trust' || body.approvalPreset === 'normal' ? body.approvalPreset : current.approvalPreset
      if (providerProfileId === null) return await reply.code(400).send({ error: 'providerProfileId is required' })
      try { return await service.updateConfig(id, providerProfileId, approvalPreset) } catch (err) {
        return await reply.code(400).send({ error: err instanceof Error ? err.message : 'could not update session' })
      }
    }
    if (typeof body.pinned === 'boolean') {
      if (!setSessionPinned(db, id, body.pinned)) return await reply.code(404).send({ error: 'session not found' })
      return getSession(db, id)
    }
    if (title === undefined) return await reply.code(400).send({ error: 'an update is required' })
    return getSession(db, id)
  })

  app.delete('/api/chat/sessions/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id
    if (!closeSession(db, id)) return await reply.code(404).send({ error: 'session not found' })
    await deleteSessionUploads(config.dataDir, id)
    return { ok: true }
  })

  app.delete('/api/chat/sessions', async (req) => {
    const preservePinned = (req.query as { preservePinned?: string }).preservePinned === 'true'
    // Capture the doomed ids before the rows go, then remove their uploads.
    const targets = listSessions(db).filter(session => !preservePinned || !session.pinned).map(session => session.id)
    const deleted = await service.clearSessions(preservePinned)
    await Promise.all(targets.map(async id => await deleteSessionUploads(config.dataDir, id)))
    return { deleted }
  })

  app.get('/api/chat/sessions/:id/events', async (req, reply) => {
    const id = (req.params as { id: string }).id
    if (getSession(db, id) === undefined) return await reply.code(404).send({ error: 'session not found' })

    // Reconnect/replay cursor: Last-Event-ID header wins, else ?since=.
    const lastEventId = req.headers['last-event-id']
    const sinceQuery = (req.query as { since?: string }).since
    const since = Number((Array.isArray(lastEventId) ? lastEventId[0] : lastEventId) ?? sinceQuery ?? 0) || 0

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })

    let lastWritten = since
    const write = (event: { seq: number, type: string }): void => {
      raw.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      lastWritten = event.seq
    }

    raw.write(`event: sync\ndata: ${JSON.stringify({ live: service.isLive(id) })}\n\n`)

    // Subscribe BEFORE replay so nothing is missed; buffer live events until
    // the replay finishes, then drain only those newer than what we replayed.
    let replaying = true
    const buffer: Array<{ seq: number, type: string }> = []
    const unsubscribe = service.onEvent(id, (event) => {
      if (replaying) buffer.push(event)
      else if (event.seq > lastWritten) write(event)
    })

    for (const event of readEventsSince(db, id, since)) write(event)
    replaying = false
    for (const event of buffer) if (event.seq > lastWritten) write(event)

    const heartbeat = setInterval(() => raw.write(': ping\n\n'), 15_000)
    req.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      raw.end()
    })
  })

  app.post('/api/chat/sessions/:id/messages', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const body = (req.body ?? {}) as { text?: unknown, attachmentIds?: unknown }
    const text = str(body.text)
    if (text === undefined) return await reply.code(400).send({ error: 'text is required' })
    if (getSession(db, id) === undefined) return await reply.code(404).send({ error: 'session not found' })

    // Chat-scoped attachments (m49): resolve pending upload ids into SDK
    // userImages (data URIs) and userFiles (paths) before dispatch.
    let attachments: MessageAttachments | undefined
    if (Array.isArray(body.attachmentIds) && body.attachmentIds.length > 0) {
      if (!body.attachmentIds.every(v => typeof v === 'string')) {
        return await reply.code(400).send({ error: 'attachmentIds must be strings' })
      }
      try {
        const resolved = await resolveAttachments(config.dataDir, id, body.attachmentIds)
        attachments = {
          userImages: await Promise.all(resolved.filter(a => a.kind === 'image').map(imageDataUri)),
          userFiles: resolved.filter(a => a.kind === 'file').map(a => a.absolutePath),
          names: resolved.map(a => ({ name: a.name, kind: a.kind })),
        }
      } catch (err) {
        return await reply.code(400).send({ error: err instanceof Error ? err.message : 'invalid attachments' })
      }
    }

    try {
      const result = await service.sendMessage(id, text, attachments)
      return await reply.code(202).send(result)
    } catch (err) {
      return await reply.code(502).send({ error: err instanceof Error ? err.message : 'agent send failed' })
    }
  })

  app.get('/api/chat/workflows', async () => {
    return { workflows: listWorkflows(vaultWorkspacePath(config.dataDir)) }
  })

  app.post('/api/chat/workflows/prep', async (req, reply) => {
    const body = (req.body ?? {}) as { title?: unknown, date?: unknown, attendees?: unknown, objective?: unknown }
    const title = str(body.title)
    if (title === undefined) return await reply.code(400).send({ error: 'title is required' })

    const params: Record<string, string> = {}
    if (body.title) params.Title = String(body.title)
    if (body.date) params.Date = String(body.date)
    if (body.attendees) params.Attendees = String(body.attendees)
    if (body.objective) params.Objective = String(body.objective)

    let message: string
    try {
      message = expandWorkflow(vaultWorkspacePath(config.dataDir), 'prep', params)
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) return await reply.code(404).send({ error: 'prep workflow not found' })
      return await reply.code(400).send({ error: err instanceof Error ? err.message : 'invalid workflow' })
    }

    try {
      const session = service.create({ title: `Prep: ${title}` })
      await service.sendMessage(session.id, message)
      return await reply.code(201).send(session)
    } catch (err) {
      return await reply.code(502).send({ error: err instanceof Error ? err.message : 'agent send failed' })
    }
  })

  app.post('/api/chat/sessions/:id/commands', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const command = str((req.body as { command?: unknown })?.command)
    if (command === undefined) return await reply.code(400).send({ error: 'command is required' })
    if (getSession(db, id) === undefined) return await reply.code(404).send({ error: 'session not found' })
    // A command is a workflow shortcut: expand the vault's workflow file and
    // send it as a normal message (the SDK does not expand slash commands).
    let message: string
    try {
      message = expandWorkflow(vaultWorkspacePath(config.dataDir), command)
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) return await reply.code(404).send({ error: err.message })
      return await reply.code(400).send({ error: err instanceof Error ? err.message : 'invalid workflow' })
    }
    try {
      const result = await service.sendMessage(id, message)
      return await reply.code(202).send(result)
    } catch (err) {
      return await reply.code(502).send({ error: err instanceof Error ? err.message : 'agent send failed' })
    }
  })

  app.post('/api/chat/sessions/:id/approvals/:toolCallId', async (req, reply) => {
    const { id, toolCallId } = req.params as { id: string, toolCallId: string }
    if (getSession(db, id) === undefined) return await reply.code(404).send({ error: 'session not found' })
    const body = (req.body ?? {}) as { approved?: unknown, reason?: unknown }
    if (typeof body.approved !== 'boolean') return await reply.code(400).send({ error: 'approved (boolean) is required' })
    const reason = typeof body.reason === 'string' ? body.reason : undefined
    if (!service.resolveApproval(toolCallId, body.approved, reason)) {
      return await reply.code(404).send({ error: 'no pending approval for that toolCallId' })
    }
    return { ok: true }
  })

  app.post('/api/chat/sessions/:id/compact', async (req, reply) => {
    const id = (req.params as { id: string }).id
    if (getSession(db, id) === undefined) return await reply.code(404).send({ error: 'session not found' })
    try {
      const result = await service.compactSession(id)
      return await reply.code(202).send(result)
    } catch (err) {
      return await reply.code(502).send({ error: err instanceof Error ? err.message : 'agent send failed' })
    }
  })

  app.post('/api/chat/sessions/:id/abort', async (req, reply) => {
    const id = (req.params as { id: string }).id
    if (getSession(db, id) === undefined) return await reply.code(404).send({ error: 'session not found' })
    try { return { aborted: await service.abort(id) } } catch (err) {
      return await reply.code(502).send({ error: err instanceof Error ? err.message : 'could not abort turn' })
    }
  })

  return service
}
