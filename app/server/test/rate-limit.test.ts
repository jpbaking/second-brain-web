import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import {
  checkThrottle,
  clearFailures,
  recordFailure,
  throttleKeys,
} from '../src/auth/throttle.js'
import type { DatabaseSync } from 'node:sqlite'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []
const dbs: DatabaseSync[] = []

function throttleDb (): DatabaseSync {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-throttle-'))
  scratch.push(root)
  const dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dataDir)
  const db = openCoreDb(dataDir)
  dbs.push(db)
  return db
}

afterEach(async () => {
  for (const db of dbs.splice(0)) db.close()
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('throttle store', () => {
  const policy = { threshold: 3, baseLockMs: 1000, maxLockMs: 60_000 }
  const keys = ['ip:test']

  it('locks after the threshold and unlocks once the lock expires', () => {
    const db = throttleDb()
    const t0 = new Date('2026-01-01T00:00:00Z')
    expect(checkThrottle(db, keys, t0).locked).toBe(false)

    recordFailure(db, keys, t0, policy)
    recordFailure(db, keys, t0, policy)
    expect(checkThrottle(db, keys, t0).locked).toBe(false) // below threshold
    recordFailure(db, keys, t0, policy) // third failure locks
    expect(checkThrottle(db, keys, t0).locked).toBe(true)

    // Still locked shortly after, unlocked well past the base lock.
    expect(checkThrottle(db, keys, new Date(t0.getTime() + 500)).locked).toBe(true)
    expect(checkThrottle(db, keys, new Date(t0.getTime() + 2000)).locked).toBe(false)
  })

  it('success clears the counters', () => {
    const db = throttleDb()
    const t0 = new Date('2026-01-01T00:00:00Z')
    recordFailure(db, keys, t0, policy)
    recordFailure(db, keys, t0, policy)
    clearFailures(db, keys)
    // A fresh failure after clearing does not immediately lock.
    recordFailure(db, keys, t0, policy)
    expect(checkThrottle(db, keys, t0).locked).toBe(false)
  })
})

describe('login rate limiting (endpoint)', () => {
  async function app (): Promise<FastifyInstance> {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-ratelimit-'))
    scratch.push(root)
    const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') })
    prepareDatabases(config.dataDir)
    const { state } = await generateOwnerAuth()
    writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
    const instance = buildApp(config)
    apps.push(instance)
    return instance
  }

  it('returns 429 with Retry-After after repeated password failures', async () => {
    const instance = await app()
    let last = await instance.inject({ method: 'POST', url: '/api/auth/password', payload: { password: 'wrong' } })
    // Default threshold is 5; keep failing until locked.
    for (let i = 0; i < 6 && last.statusCode === 401; i++) {
      last = await instance.inject({ method: 'POST', url: '/api/auth/password', payload: { password: 'wrong' } })
    }
    expect(last.statusCode).toBe(429)
    expect(last.headers['retry-after']).toBeDefined()
  })

  it('references throttleKeys for the account and IP', () => {
    expect(throttleKeys('1.2.3.4')).toEqual(['ip:1.2.3.4', 'account:owner'])
  })
})
