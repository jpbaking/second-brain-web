import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { coreDbPath, openCoreDb, openDatabase, openSidecarDb, sidecarDbPath } from '../src/db.js'

const scratch: string[] = []
function tempDataDir (): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-db-'))
  mkdirSync(path.join(dir, 'db'))
  mkdirSync(path.join(dir, 'indexes'))
  scratch.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('openDatabase', () => {
  it('applies WAL and foreign keys on every fresh connection', () => {
    const file = path.join(tempDataDir(), 'db', 'probe.sqlite')
    const db = openDatabase(file)
    expect(db.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' })
    expect(db.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 })
    db.close()

    const again = openDatabase(file)
    expect(again.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' })
    expect(again.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 })
    again.close()
  })

  it('enforces foreign keys in practice', () => {
    const db = openDatabase(path.join(tempDataDir(), 'db', 'fk.sqlite'))
    db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id))')
    expect(() => db.prepare('INSERT INTO child (parent_id) VALUES (99)').run()).toThrow(/FOREIGN KEY/i)
    db.close()
  })

  it('keeps core and sidecar databases in their own files', () => {
    const dataDir = tempDataDir()
    expect(coreDbPath(dataDir)).toBe(path.join(dataDir, 'db', 'app.sqlite'))
    expect(sidecarDbPath(dataDir)).toBe(path.join(dataDir, 'indexes', 'vault.sqlite'))
    const core = openCoreDb(dataDir)
    const sidecar = openSidecarDb(dataDir)
    core.close()
    sidecar.close()
    expect(existsSync(coreDbPath(dataDir))).toBe(true)
    expect(existsSync(sidecarDbPath(dataDir))).toBe(true)
  })
})
