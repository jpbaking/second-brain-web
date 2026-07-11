import { openCoreDb } from '../db.js'
import { expandWorkflow } from './workflows.js'
import { vaultWorkspacePath } from '../vault/config.js'
import type { AppConfig } from '../config.js'
import type { AgentSessionService } from './session.js'

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null

  constructor (
    private readonly config: AppConfig,
    private readonly agentService: AgentSessionService
  ) {}

  start (): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => { this.tick().catch(console.error) }, 60_000)
    // Run an initial tick shortly after startup
    setTimeout(() => { this.tick().catch(console.error) }, 1000)
  }

  stop (): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async tick (): Promise<void> {
    const db = openCoreDb(this.config.dataDir)
    try {
      const jobs = db.prepare('SELECT * FROM scheduled_jobs').all() as Array<{
        id: string
        name: string
        workflow: string
        frequency: string
        last_run_at: string | null
      }>

      const now = Date.now()

      for (const job of jobs) {
        let isDue = false
        if (job.last_run_at === null) {
          isDue = true
        } else {
          const lastRun = new Date(job.last_run_at).getTime()
          const msSinceLast = now - lastRun

          if (job.frequency === 'hourly' && msSinceLast >= 60 * 60 * 1000) isDue = true
          if (job.frequency === 'daily' && msSinceLast >= 24 * 60 * 60 * 1000) isDue = true
          if (job.frequency === 'weekly' && msSinceLast >= 7 * 24 * 60 * 60 * 1000) isDue = true
        }

        if (isDue) {
          try {
            await this.runJob(job)
            db.prepare('UPDATE scheduled_jobs SET last_run_at = ? WHERE id = ?').run(
              new Date().toISOString(),
              job.id
            )
          } catch (err) {
            console.error(`Failed to run job ${job.name}:`, err)
          }
        }
      }
    } finally {
      db.close()
    }
  }

  private async runJob (job: { name: string, workflow: string }): Promise<void> {
    const prompt = expandWorkflow(vaultWorkspacePath(this.config.dataDir), job.workflow)
    const title = `[Scheduled] ${job.name}`
    const session = this.agentService.create({ title, approvalPreset: 'normal' })
    await this.agentService.sendMessage(session.id, prompt)
  }
}
