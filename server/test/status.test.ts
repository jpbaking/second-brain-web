import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import type { SystemStatus } from '../src/status.js'

const scratch: string[] = []
function tempConfig () {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-status-'))
  scratch.push(root)
  return loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') })
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('status endpoint', () => {
  it('reports setup, database, and auth state', async () => {
    const config = tempConfig()
    prepareDatabases(config.dataDir)
    const app = buildApp(config)

    const res = await app.inject({ method: 'GET', url: '/api/status' })
    expect(res.statusCode).toBe(200)

    const body = res.json() as SystemStatus
    expect(body.dataDir).toMatchObject({
      path: config.dataDir,
      exists: true,
      mode: '700',
      private: true,
      state: 'ready'
    })
    expect(body.databases.core).toMatchObject({
      exists: true,
      state: 'ready',
      integrity: 'ok',
      schemaVersion: 8
    })
    expect(body.databases.sidecar).toMatchObject({
      exists: true,
      state: 'ready',
      integrity: 'ok',
      schemaVersion: 1
    })
    expect(body.auth).toEqual({
      configured: false,
      message: 'Auth not configured - run reset script.'
    })

    await app.close()
  })

  it('keeps status unavailable when buildApp has no config', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/status' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ error: 'configuration unavailable' })
    await app.close()
  })
})
