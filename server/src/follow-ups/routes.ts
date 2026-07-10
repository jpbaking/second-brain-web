import { parseFollowUps } from './parse.js'
import { vaultWorkspacePath } from '../vault/config.js'
import type { FollowUpItem } from './parse.js'
import type { AppConfig } from '../config.js'
import type { AgentSessionService } from '../agent/session.js'
import type { FastifyInstance } from 'fastify'

export type FollowUpFilter = 'active' | 'overdue' | 'today' | 'week' | 'waiting-on' | 'i-owe' | 'completed'
const FILTERS = new Set<FollowUpFilter>(['active', 'overdue', 'today', 'week', 'waiting-on', 'i-owe', 'completed'])

export function registerFollowUpRoutes (app: FastifyInstance, config: AppConfig): void {
  app.get('/api/follow-ups', async (req, reply) => {
    const requested = (req.query as { filter?: string }).filter ?? 'active'
    if (!FILTERS.has(requested as FollowUpFilter)) return await reply.code(400).send({ error: 'Invalid follow-up filter.' })
    const all = parseFollowUps(vaultWorkspacePath(config.dataDir))
    const today = new Date()
    const filter = requested as FollowUpFilter
    return {
      filter,
      today: localDate(today),
      items: filterFollowUps(all, filter, today),
      counts: Object.fromEntries(Array.from(FILTERS, key => [key, filterFollowUps(all, key, today).length])),
    }
  })
}

/**
 * Completion and edits (m9a-05). A follow-up lives in the vault's own Markdown,
 * so we never write it from the web process directly. Instead we route the
 * change through the agent {@link AgentSessionService} exactly like quick
 * capture: the same tool-policy guard, vault write lock, and inspectable event
 * stream apply, and the immutable `library/` originals guard still holds. The
 * owner explicitly asked for the change, so the filing session auto-approves
 * its own writes via the high-trust preset.
 */
export function registerFollowUpActionRoutes (app: FastifyInstance, config: AppConfig, service: AgentSessionService): void {
  app.post('/api/follow-ups/:id/complete', async (req, reply) => {
    const item = findItem(config, (req.params as { id?: string }).id)
    if (item === undefined) return await reply.code(404).send({ error: 'Unknown follow-up item.' })
    return await dispatch(service, reply, `Complete: ${item.text}`, completeInstruction(item))
  })

  app.post('/api/follow-ups/:id/edit', async (req, reply) => {
    const body = (req.body ?? {}) as { text?: unknown }
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (text === '') return await reply.code(400).send({ error: 'text is required' })
    const item = findItem(config, (req.params as { id?: string }).id)
    if (item === undefined) return await reply.code(404).send({ error: 'Unknown follow-up item.' })
    return await dispatch(service, reply, `Edit: ${item.text}`, editInstruction(item, text))
  })
}

function findItem (config: AppConfig, id: string | undefined): FollowUpItem | undefined {
  if (id === undefined || id === '') return undefined
  return parseFollowUps(vaultWorkspacePath(config.dataDir)).find(item => item.id === id)
}

async function dispatch (service: AgentSessionService, reply: import('fastify').FastifyReply, title: string, instruction: string): Promise<unknown> {
  let session
  try {
    session = service.create({ title, approvalPreset: 'high-trust' })
  } catch (err) {
    return await reply.code(400).send({ error: err instanceof Error ? err.message : 'could not start follow-up action' })
  }
  try {
    await service.sendMessage(session.id, instruction)
    return await reply.code(201).send({ ok: true, sessionId: session.id })
  } catch (err) {
    return await reply.code(502).send({ error: err instanceof Error ? err.message : 'agent dispatch failed', sessionId: session.id })
  }
}

const SHARED_GUIDANCE =
  ' Change only that single checkbox line — do not touch other entries or reflow the file — ' +
  'and follow your vault rules for reminders and commitments (keep any source link, and log the ' +
  'change where your conventions require it). Do not ask clarifying questions; make the edit, then ' +
  'briefly confirm what you changed.'

function locator (item: FollowUpItem): string {
  return `the follow-up "${item.text}" in ${item.sourceFile} (around line ${item.sourceLine})`
}

function completeInstruction (item: FollowUpItem): string {
  return `The principal marked a follow-up as done from the web console. Mark ${locator(item)} as complete ` +
    'by ticking its checkbox (and moving it under the Done section if that is your convention).' + SHARED_GUIDANCE
}

function editInstruction (item: FollowUpItem, text: string): string {
  return `The principal edited a follow-up from the web console. Update the text of ${locator(item)} to read ` +
    `exactly:\n\n${text}\n\nKeep its checkbox state and any due date unless the new text changes them.` + SHARED_GUIDANCE
}

export function filterFollowUps (items: FollowUpItem[], filter: FollowUpFilter, today: Date): FollowUpItem[] {
  const current = localDate(today)
  const weekEnd = new Date(`${current}T00:00:00`)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const end = localDate(weekEnd)
  return items.filter(item => {
    if (filter === 'completed') return item.completed
    if (item.completed) return false
    if (filter === 'active') return true
    if (filter === 'waiting-on' || filter === 'i-owe') return item.direction === filter
    if (item.dueDate === null) return false
    if (filter === 'overdue') return item.dueDate < current
    if (filter === 'today') return item.dueDate === current
    return item.dueDate > current && item.dueDate <= end
  }).sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') || a.text.localeCompare(b.text))
}

function localDate (date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
