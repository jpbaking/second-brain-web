import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

async function fixture (): Promise<{ dataDir: string, workspace: string }> {
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
  return { dataDir: config.dataDir, workspace }
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
})
