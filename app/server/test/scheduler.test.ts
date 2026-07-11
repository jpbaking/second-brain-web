import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { SchedulerService } from '../src/agent/scheduler.js'
import { AgentSessionService } from '../src/chat/routes.js'
import { openCoreDb } from '../src/db.js'

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('SchedulerService', () => {
  it('runs due jobs and updates last_run_at', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-sched-test-'))
    scratch.push(root)
    const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'k' })
    prepareDatabases(config.dataDir)

    // Write a dummy workflow
    mkdirSync(path.join(root, 'data', 'workspaces', 'second-brain', '.clinerules', 'workflows'), { recursive: true })
    writeFileSync(path.join(root, 'data', 'workspaces', 'second-brain', '.clinerules', 'workflows', 'brief.md'), 'run morning brief', 'utf8')

    // Create a mock AgentSessionService that just records sessions
    const created: string[] = []
    const agentService = {
      create: () => { created.push('called'); return { id: 's-1' } },
      sendMessage: async () => {},
    } as unknown as AgentSessionService

    const db = openCoreDb(config.dataDir)
    db.prepare(`
      INSERT INTO scheduled_jobs (id, name, workflow, frequency, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('job-1', 'Morning Brief', 'brief', 'daily', new Date().toISOString())
    db.close()

    const scheduler = new SchedulerService(config, agentService)
    await scheduler.tick()

    expect(created.length).toBe(1)

    const db2 = openCoreDb(config.dataDir)
    const job = db2.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get('job-1') as { last_run_at: string }
    expect(job.last_run_at).not.toBeNull()
    db2.close()
  })
})
