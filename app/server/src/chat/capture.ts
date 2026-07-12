import type { AgentSessionService } from '../agent/session.js'
import type { FastifyInstance } from 'fastify'

/**
 * Quick capture intake (milestone 7). Per phase-001, a captured thought is NOT
 * stored as an app-only note — it is routed through the agent and vault
 * workflow so facts land in `memory/` with dates, indexes, and log entries.
 *
 * We reuse the chat {@link AgentSessionService}: each capture opens a chat
 * session and dispatches a filing instruction, so the same guard, write lock,
 * and event stream apply and the owner can open the session to see how it was
 * filed. Guarded by the m02 auth guard (a non-health/status/auth /api/ route).
 */

const FILING_INSTRUCTION =
  'The principal captured the following quick note from the web console. File it ' +
  'into the vault by following the capture/inbox conventions in your rules: record ' +
  'facts, reminders, and commitments in memory/ with the appropriate dates, indexes, ' +
  'and log entries. Do not ask clarifying questions — use your best judgement, then ' +
  'briefly confirm what you filed and where.\n\nCAPTURED NOTE:\n'

/** Short, human-readable session title from the captured text. */
function titleFrom (content: string): string {
  const firstLine = content.trim().split('\n')[0] ?? ''
  const trimmed = firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine
  return `Capture: ${trimmed}`
}

export function registerCaptureRoutes (app: FastifyInstance, service: AgentSessionService): void {
  app.post('/api/capture', async (req, reply) => {
    const body = (req.body ?? {}) as { content?: unknown }
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (content === '') {
      return await reply.code(400).send({ error: 'content is required' })
    }

    let session
    try {
      // Quick capture is fire-and-forget (phase-001: "minimal friction",
      // usable on phone), so the filing session auto-approves its own writes
      // via the auto mode. The library/ originals guard still applies
      // regardless of preset, so this cannot corrupt immutable originals.
      session = service.create({ title: titleFrom(content), approvalPreset: 'auto' })
    } catch (err) {
      // No enabled provider profile configured yet.
      return await reply.code(400).send({ error: err instanceof Error ? err.message : 'could not start capture' })
    }

    try {
      await service.sendMessage(session.id, FILING_INSTRUCTION + content)
      return await reply.code(201).send({ ok: true, sessionId: session.id })
    } catch (err) {
      return await reply.code(502).send({ error: err instanceof Error ? err.message : 'agent dispatch failed', sessionId: session.id })
    }
  })
}
