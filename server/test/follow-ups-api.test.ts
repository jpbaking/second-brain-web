import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import { vaultWorkspacePath } from '../src/vault/config.js'
import { filterFollowUps } from '../src/follow-ups/routes.js'
import type { FollowUpItem } from '../src/follow-ups/parse.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

function cookieValue (header: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header]
  return values.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0]
}

async function fixture (): Promise<{ app: FastifyInstance, cookie: string, notes: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-follow-api-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') })
  prepareDatabases(config.dataDir)
  const notes = path.join(vaultWorkspacePath(config.dataDir), 'memory', 'notes')
  mkdirSync(notes, { recursive: true })
  writeFileSync(path.join(notes, 'reminders.md'), '## Open\n- [ ] 2026-07-09 due: Late\n- [ ] 2026-07-10 due: Today\n- [ ] 2026-07-15 due: Soon\n- [ ] Undated\n## Done\n- [x] 2026-07-01 due: Finished\n')
  writeFileSync(path.join(notes, 'commitments.md'), '## I owe\n- [ ] 2026-07-11 due: Send reply\n## Waiting on\n- [ ] 2026-07-12 due: Receive approval\n')
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state)
  const app = buildApp(config)
  apps.push(app)
  const passwordResponse = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(passwordResponse.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({ method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code } })
  return { app, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`, notes }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('follow-up API', () => {
  it('requires authentication and rejects unknown filters', async () => {
    const { app, cookie } = await fixture()
    expect((await app.inject({ method: 'GET', url: '/api/follow-ups' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/follow-ups?filter=nope', headers: { cookie } })).statusCode).toBe(400)
  })

  it('returns filtered items and counts for the current date', async () => {
    const { app, cookie } = await fixture()
    const get = async (filter: string) => (await app.inject({ method: 'GET', url: `/api/follow-ups?filter=${filter}`, headers: { cookie } })).json()
    expect((await get('overdue')).items.map((item: FollowUpItem) => item.text)).toEqual(['Late'])
    expect((await get('today')).items[0].text).toBe('Today')
    expect((await get('week')).items.map((item: FollowUpItem) => item.text)).toEqual(['Send reply', 'Receive approval', 'Soon'])
    expect((await get('waiting-on')).items[0].text).toBe('Receive approval')
    expect((await get('i-owe')).items[0].text).toBe('Send reply')
    const completed = await get('completed')
    expect(completed.items[0].text).toBe('Finished')
    expect(completed.counts).toMatchObject({ active: 6, overdue: 1, today: 1, week: 3, 'waiting-on': 1, 'i-owe': 1, completed: 1 })
  })

  it('links each item to its source file, line, and vault-safe linked source', async () => {
    const { app, cookie, notes } = await fixture()
    writeFileSync(path.join(notes, 'reminders.md'), [
      '## Open',
      '- [ ] 2026-07-09 due: Late — source: [thread](../inbox/2026-07-01.md#note)',
      '- [ ] 2026-07-15 due: Soon — source: [remote](https://example.com/x)',
      '- [ ] 2026-07-16 due: Plain',
      '',
    ].join('\n'))
    const items = (await app.inject({ method: 'GET', url: '/api/follow-ups?filter=active', headers: { cookie } })).json().items as FollowUpItem[]
    const byText = (needle: string) => items.find(item => item.text.startsWith(needle))

    const late = byText('Late')
    expect(late).toMatchObject({ sourceFile: 'memory/notes/reminders.md', sourceLine: 2, linkedSource: 'memory/inbox/2026-07-01.md' })

    // Links that leave the vault or point off-host are not surfaced.
    expect(byText('Soon')?.linkedSource).toBeNull()
    expect(byText('Plain')).toMatchObject({ sourceFile: 'memory/notes/reminders.md', sourceLine: 4, linkedSource: null })

    // Commitments still report their own file and line.
    expect(byText('Send reply')).toMatchObject({ sourceFile: 'memory/notes/commitments.md', sourceLine: 2 })
  })

  it('applies date boundaries deterministically', () => {
    const base: FollowUpItem = { id: 'x', kind: 'reminder', direction: null, text: 'x', dueDate: null, completed: false, sourceFile: 'memory/notes/reminders.md', sourceLine: 1, linkedSource: null }
    const items = ['2026-07-09', '2026-07-10', '2026-07-17', '2026-07-18'].map((dueDate, index) => ({ ...base, id: String(index), dueDate }))
    const today = new Date(2026, 6, 10)
    expect(filterFollowUps(items, 'overdue', today).map(item => item.dueDate)).toEqual(['2026-07-09'])
    expect(filterFollowUps(items, 'today', today).map(item => item.dueDate)).toEqual(['2026-07-10'])
    expect(filterFollowUps(items, 'week', today).map(item => item.dueDate)).toEqual(['2026-07-17'])
  })
})
