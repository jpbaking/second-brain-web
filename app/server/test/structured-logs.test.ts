import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { configureLogging, LoggingConfigError, resolveLogLevel } from '../src/logging.js'
import log4js from 'log4js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

async function appWithCapturedLogs (): Promise<{ app: FastifyInstance, lines: string[] }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-logs-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'test-owner-key' })
  prepareDatabases(config.dataDir)
  const { state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
  const lines: string[] = []
  const app = buildApp(config, { logStream: { write: (line: string) => lines.push(line) } })
  apps.push(app)
  return { app, lines }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('structured logging', () => {
  it('emits log4js JSON request/response logs with structured fields', async () => {
    const { app, lines } = await appWithCapturedLogs()
    await app.inject({ method: 'GET', url: '/api/health' })

    const records = lines.map(line => JSON.parse(line) as Record<string, unknown>)
    // Every line is valid JSON with the shared log4js schema.
    expect(records.length).toBeGreaterThan(0)
    expect(records.every(r => typeof r.level === 'string' && typeof r.time === 'number' && typeof r.category === 'string' && typeof r.msg === 'string')).toBe(true)

    const request = records.find(r => (r.req as { url?: string } | undefined)?.url === '/api/health')
    expect((request?.req as { method?: string }).method).toBe('GET')
    const response = records.find(r => r.res !== undefined)
    expect((response?.res as { statusCode?: number }).statusCode).toBe(200)
  })

  it('never logs the login password or the session cookie', async () => {
    const { app, lines } = await appWithCapturedLogs()
    const password = 'SUPER-SECRET-PASSWORD-9f3a'
    const cookieSecret = 'SECRET-COOKIE-VALUE-7b21'

    await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie: `sbw_session=${cookieSecret}` },
      payload: { password },
    })

    const all = lines.join('\n')
    // The request was logged…
    expect(all).toContain('/api/auth/password')
    // …but neither the body password nor the cookie value ever appears.
    expect(all).not.toContain(password)
    expect(all).not.toContain(cookieSecret)
  })

  it('logs vault-lock poll requests at trace and other requests at info', async () => {
    const { app, lines } = await appWithCapturedLogs()
    await app.inject({ method: 'GET', url: '/api/vault/lock' })
    await app.inject({ method: 'GET', url: '/api/health' })

    const records = lines.map(line => JSON.parse(line) as { level: string, msg: string, req?: { url?: string }, reqId?: string })
    const lockId = records.find(r => r.req?.url === '/api/vault/lock')?.reqId
    expect(lockId).toBeDefined()
    const lockRecords = records.filter(r => r.reqId === lockId)
    // Both the received and completed lines of the poll sit at trace.
    expect(lockRecords.length).toBeGreaterThanOrEqual(2)
    expect(lockRecords.every(r => r.level === 'trace')).toBe(true)
    expect(records.find(r => r.req?.url === '/api/health')?.level).toBe('info')
  })

  it('configures the root log4js level from the environment', () => {
    expect(resolveLogLevel({})).toBe('info')
    expect(configureLogging({ SECOND_BRAIN_WEB_LOG_LEVEL: 'WARN' })).toBe('warn')
    const logger = log4js.getLogger('level-check')
    expect(logger.isInfoEnabled()).toBe(false)
    expect(logger.isWarnEnabled()).toBe(true)
  })

  it('rejects an invalid root log level', () => {
    expect(() => resolveLogLevel({ SECOND_BRAIN_WEB_LOG_LEVEL: 'verbose' })).toThrow(LoggingConfigError)
  })
})
