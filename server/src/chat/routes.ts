import { openCoreDb } from '../db.js'
import { resolveDefaultSnapshot, resolveSnapshot } from '../providers/snapshot.js'
import { vaultWorkspacePath } from '../vault/config.js'
import { AgentSessionService } from '../agent/session.js'
import { appendEvent, closeSession, getSession, listSessions, readEventsSince, renameSession } from '../agent/chat-store.js'
import type { AgentRunner } from '../agent/runner.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

/**
 * Chat HTTP routes (milestone 5A). Guarded by the m02 auth guard (everything
 * under /api/ that is not health/status/auth). The routes drive a single
 * {@link AgentSessionService} whose in-memory live-session map must persist for
 * the app's lifetime, so the service (and its DB connection) is built once here.
 */
export function registerChatRoutes (app: FastifyInstance, config: AppConfig, runner: AgentRunner): void {
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
    const body = (req.body ?? {}) as { title?: unknown, providerProfileId?: unknown }
    const title = str(body.title) ?? 'New chat'
    const providerProfileId = str(body.providerProfileId) ?? null
    try {
      const session = service.create({ title, providerProfileId })
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
    const title = str((req.body as { title?: unknown })?.title)
    if (title === undefined) return await reply.code(400).send({ error: 'title is required' })
    if (!renameSession(db, id, title)) return await reply.code(404).send({ error: 'session not found' })
    return getSession(db, id)
  })

  app.delete('/api/chat/sessions/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id
    if (!closeSession(db, id)) return await reply.code(404).send({ error: 'session not found' })
    return { ok: true }
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
    const text = str((req.body as { text?: unknown })?.text)
    if (text === undefined) return await reply.code(400).send({ error: 'text is required' })
    if (getSession(db, id) === undefined) return await reply.code(404).send({ error: 'session not found' })
    try {
      const result = await service.sendMessage(id, text)
      return await reply.code(202).send(result)
    } catch (err) {
      return await reply.code(502).send({ error: err instanceof Error ? err.message : 'agent send failed' })
    }
  })

  app.post('/api/chat/sessions/:id/commands', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const command = str((req.body as { command?: unknown })?.command)
    if (command === undefined) return await reply.code(400).send({ error: 'command is required' })
    if (getSession(db, id) === undefined) return await reply.code(404).send({ error: 'session not found' })
    // Workflow-shortcut expansion + dispatch lands in m5a-08; record intent for now.
    appendEvent(db, id, 'command', { command })
    return await reply.code(202).send({ accepted: true })
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
    // Manual compaction is milestone 5B; record the request now.
    appendEvent(db, id, 'compaction_requested', null)
    return await reply.code(202).send({ accepted: true })
  })
}
