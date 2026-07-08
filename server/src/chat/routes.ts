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
  app.addHook('onClose', () => { db.close() })

  const secretsEnv = { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey }
  const service = new AgentSessionService(db, runner, {
    snapshotFor: (profileId) => profileId === null
      ? resolveDefaultSnapshot(db, secretsEnv)
      : resolveSnapshot(db, profileId, secretsEnv),
    vaultCwd: vaultWorkspacePath(config.dataDir),
  })

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

  app.post('/api/chat/sessions/:id/compact', async (req, reply) => {
    const id = (req.params as { id: string }).id
    if (getSession(db, id) === undefined) return await reply.code(404).send({ error: 'session not found' })
    // Manual compaction is milestone 5B; record the request now.
    appendEvent(db, id, 'compaction_requested', null)
    return await reply.code(202).send({ accepted: true })
  })
}
