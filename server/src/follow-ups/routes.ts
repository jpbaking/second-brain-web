import { parseFollowUps } from './parse.js'
import { vaultWorkspacePath } from '../vault/config.js'
import type { FollowUpItem } from './parse.js'
import type { AppConfig } from '../config.js'
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
