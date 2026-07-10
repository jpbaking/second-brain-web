import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { openCoreDb } from '../src/db.js'
import { prepareDatabases } from '../src/migrations.js'
import { commitVault } from '../src/vault/commit.js'
import { vaultWorkspacePath, writeVaultConfig } from '../src/vault/config.js'
import { readGitStatus } from '../src/vault/git-status.js'
import { runGit } from '../src/vault/git.js'

const scratch: string[] = []
const GIT_ID = ['-c', 'user.email=loop@example.com', '-c', 'user.name=Loop Test']

async function fixture (): Promise<{ dataDir: string, workspace: string, remote: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-commit-loop-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') })
  prepareDatabases(config.dataDir)
  const workspace = vaultWorkspacePath(config.dataDir)
  mkdirSync(path.join(workspace, 'scripts'), { recursive: true })
  await runGit(['init', '-b', 'main'], { cwd: workspace })
  writeFileSync(path.join(workspace, 'README.md'), '# Test vault\n')
  writeFileSync(path.join(workspace, 'scripts', 'health.py'), 'print("All checks passed: 0 issues")\n')
  await runGit(['add', '.'], { cwd: workspace })
  await runGit([...GIT_ID, 'commit', '-m', 'initial'], { cwd: workspace })
  const remote = path.join(root, 'remote.git')
  await runGit(['clone', '--bare', workspace, remote])
  await runGit(['remote', 'add', 'origin', remote], { cwd: workspace })
  const db = openCoreDb(config.dataDir)
  writeVaultConfig(db, { remoteUrl: remote, branch: 'main' })
  db.close()
  return { dataDir: config.dataDir, workspace, remote }
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('commit, health, push loop', () => {
  it('health gate leaves unhealthy changes local and unstaged', async () => {
    const { dataDir, workspace } = await fixture()
    writeFileSync(path.join(workspace, 'memory.md'), 'must stay local\n')
    writeFileSync(path.join(workspace, 'scripts', 'health.py'), 'print("2 issues")\n')
    const before = (await readGitStatus(workspace)).commit
    const db = openCoreDb(dataDir)
    const result = await commitVault(db, dataDir)
    db.close()

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/blocked.*2 issues/i)
    expect(result.health?.issueCount).toBe(2)
    const after = await readGitStatus(workspace)
    expect(after.commit).toBe(before)
    expect(after.dirty).toBe(true)
    const staged = await runGit(['diff', '--cached', '--name-only'], { cwd: workspace })
    expect(staged.stdout.trim()).toBe('')
  })

  it('commits healthy changes with reviewed paths and timestamp in the message', async () => {
    const { dataDir, workspace } = await fixture()
    writeFileSync(path.join(workspace, 'memory.md'), 'healthy change\n')
    const now = new Date('2026-07-10T09:20:00.000Z')
    const db = openCoreDb(dataDir)
    const result = await commitVault(db, dataDir, now)
    db.close()

    expect(result.success).toBe(true)
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/)
    expect((await readGitStatus(workspace)).dirty).toBe(false)
    const message = await runGit(['log', '-1', '--pretty=%B'], { cwd: workspace })
    expect(message.stdout).toContain('vault: update 1 file via web')
    expect(message.stdout).toContain('Operation: 2026-07-10T09:20:00.000Z')
    expect(message.stdout).toContain('- memory.md')
    const author = await runGit(['log', '-1', '--pretty=%an <%ae>'], { cwd: workspace })
    expect(author.stdout.trim()).toBe('Second Brain Web <system@secondbrain.local>')
  })

  it('pushes the new commit to the configured remote branch', async () => {
    const { dataDir, workspace, remote } = await fixture()
    writeFileSync(path.join(workspace, 'pushed.md'), 'push proof\n')
    const db = openCoreDb(dataDir)
    const result = await commitVault(db, dataDir)
    db.close()

    expect(result.success).toBe(true)
    const local = await runGit(['rev-parse', 'HEAD'], { cwd: workspace })
    const remoteHead = await runGit(['--git-dir', remote, 'rev-parse', 'refs/heads/main'])
    expect(remoteHead.stdout.trim()).toBe(local.stdout.trim())
    expect(result.commit).toBe(remoteHead.stdout.trim())
  })

  it('failure recovery retries a push after the local commit made the tree clean', async () => {
    const { dataDir, workspace, remote } = await fixture()
    writeFileSync(path.join(workspace, 'recovery.md'), 'recover me\n')
    const unavailableRemote = `${remote}.offline`
    renameSync(remote, unavailableRemote)
    let db = openCoreDb(dataDir)
    const failed = await commitVault(db, dataDir)
    db.close()
    expect(failed.success).toBe(false)
    expect(failed.stage).toBe('push')
    expect((await readGitStatus(workspace)).dirty).toBe(false)

    renameSync(unavailableRemote, remote)
    db = openCoreDb(dataDir)
    const retried = await commitVault(db, dataDir)
    db.close()
    expect(retried.success).toBe(true)
    expect(retried.stage).toBe('complete')
    const remoteHead = await runGit(['--git-dir', remote, 'rev-parse', 'refs/heads/main'])
    expect(remoteHead.stdout.trim()).toBe(retried.commit)
  })
})
