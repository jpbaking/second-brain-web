import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { getReportProvenance, saveReportProvenance, deleteReportProvenance } from '../src/reports/store.js'
import { createSession } from '../src/agent/chat-store.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadConfig } from '../src/config.js'

describe('reports/store', () => {
  let dataDir: string
  let db: DatabaseSync
  let sessionId: string

  beforeEach(() => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-reports-store-'))
    dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
    prepareDatabases(dataDir)
    db = openCoreDb(dataDir)
    const session = createSession(db, { title: 'Test Session' })
    sessionId = session.id
  })

  afterEach(() => {
    db.close()
    rmSync(path.dirname(dataDir), { recursive: true, force: true })
  })

  it('saves and retrieves report provenance', () => {
    saveReportProvenance(db, {
      reportPath: 'reports/2026/test.md',
      sessionId,
      prompt: 'Write a test report',
      providerProfileId: 'test-profile',
      vaultCommit: 'abcd123'
    })

    const prov = getReportProvenance(db, 'reports/2026/test.md')
    expect(prov).toBeDefined()
    expect(prov?.sessionId).toBe(sessionId)
    expect(prov?.prompt).toBe('Write a test report')
    expect(prov?.providerProfileId).toBe('test-profile')
    expect(prov?.vaultCommit).toBe('abcd123')
    expect(prov?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('updates provenance on conflict', () => {
    saveReportProvenance(db, {
      reportPath: 'reports/2026/test.md',
      sessionId,
      prompt: 'v1',
      providerProfileId: null,
      vaultCommit: null
    })

    saveReportProvenance(db, {
      reportPath: 'reports/2026/test.md',
      sessionId,
      prompt: 'v2',
      providerProfileId: 'updated-profile',
      vaultCommit: 'efgh456'
    })

    const prov = getReportProvenance(db, 'reports/2026/test.md')
    expect(prov?.prompt).toBe('v2')
    expect(prov?.providerProfileId).toBe('updated-profile')
  })

  it('deletes report provenance', () => {
    saveReportProvenance(db, {
      reportPath: 'reports/2026/test.md',
      sessionId,
      prompt: null,
      providerProfileId: null,
      vaultCommit: null
    })

    expect(deleteReportProvenance(db, 'reports/2026/test.md')).toBe(true)
    expect(getReportProvenance(db, 'reports/2026/test.md')).toBeUndefined()
    expect(deleteReportProvenance(db, 'reports/2026/test.md')).toBe(false)
  })

  it('cascades deletion when chat session is deleted', () => {
    saveReportProvenance(db, {
      reportPath: 'reports/2026/test.md',
      sessionId,
      prompt: null,
      providerProfileId: null,
      vaultCommit: null
    })

    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId)

    expect(getReportProvenance(db, 'reports/2026/test.md')).toBeUndefined()
  })
})
