import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { runGit } from '../src/vault/git.js'
import { readVaultConfig, vaultWorkspacePath, writeVaultConfig } from '../src/vault/config.js'
import { syncVault } from '../src/vault/sync.js'
import type { DatabaseSync } from 'node:sqlite'

const scratch: string[] = []
const dbs: DatabaseSync[] = []
const GIT_ID = ['-c', 'user.email=t@example.com', '-c', 'user.name=Test']

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A bare remote (with an origin-linked source repo for later pushes). */
async function seedRemote (): Promise<{ bare: string, src: string }> {
  const base = mkdtempSync(path.join(tmpdir(), 'sbw-remote-'))
  scratch.push(base)
  const src = path.join(base, 'src')
  mkdirSync(src)
  await runGit(['init', '-b', 'main'], { cwd: src })
  writeFileSync(path.join(src, 'README.md'), '# vault\n')
  await runGit(['add', '.'], { cwd: src })
  await runGit([...GIT_ID, 'commit', '-m', 'c1'], { cwd: src })
  const bare = path.join(base, 'remote.git')
  await runGit(['clone', '--bare', src, bare])
  await runGit(['-C', src, 'remote', 'add', 'origin', bare])
  return { bare, src }
}

function dataDirFixture (): { db: DatabaseSync, dataDir: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-clone-'))
  scratch.push(root)
  const dataDir = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }).dataDir
  prepareDatabases(dataDir)
  const db = openCoreDb(dataDir)
  dbs.push(db)
  return { db, dataDir }
}

describe('vault sync', () => {
  it('reports not-configured without a remote', async () => {
    const { db, dataDir } = dataDirFixture()
    const res = await syncVault(db, dataDir)
    expect(res.state).toBe('not-configured')
  })

  it('clones a configured remote and records the commit', async () => {
    const { bare } = await seedRemote()
    const { db, dataDir } = dataDirFixture()
    writeVaultConfig(db, { remoteUrl: bare, branch: 'main' })

    const res = await syncVault(db, dataDir)
    expect(res.state).toBe('ready')
    expect(res.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(existsSync(path.join(vaultWorkspacePath(dataDir), 'README.md'))).toBe(true)
    expect(readVaultConfig(db, dataDir).lastCommit).toBe(res.commit)
  })

  it('pulls new commits on a re-run', async () => {
    const { bare, src } = await seedRemote()
    const { db, dataDir } = dataDirFixture()
    writeVaultConfig(db, { remoteUrl: bare, branch: 'main' })
    const first = await syncVault(db, dataDir)

    // Push a second commit to the remote.
    writeFileSync(path.join(src, 'NEW.md'), 'second\n')
    await runGit(['-C', src, 'add', '.'], {})
    await runGit(['-C', src, ...GIT_ID, 'commit', '-m', 'c2'], {})
    await runGit(['-C', src, 'push', 'origin', 'main'], {})

    const second = await syncVault(db, dataDir)
    expect(second.state).toBe('ready')
    expect(second.commit).not.toBe(first.commit)
    expect(existsSync(path.join(vaultWorkspacePath(dataDir), 'NEW.md'))).toBe(true)
  })

  it('refuses a workspace pointing at a different remote', async () => {
    const { bare } = await seedRemote()
    const other = await seedRemote()
    const { db, dataDir } = dataDirFixture()
    writeVaultConfig(db, { remoteUrl: bare, branch: 'main' })
    await syncVault(db, dataDir) // clone from bare

    writeVaultConfig(db, { remoteUrl: other.bare })
    const res = await syncVault(db, dataDir)
    expect(res.state).toBe('remote-mismatch')
  })
})
