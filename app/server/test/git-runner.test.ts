import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildGitSshCommand, runGit } from '../src/vault/git.js'

const scratch: string[] = []
function tempDir (): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-git-'))
  scratch.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('buildGitSshCommand', () => {
  it('uses the key path with IdentitiesOnly', () => {
    const cmd = buildGitSshCommand('/data/second-brain-web/ssh/deploy_key')
    expect(cmd).toContain('-i "/data/second-brain-web/ssh/deploy_key"')
    expect(cmd).toContain('IdentitiesOnly=yes')
    expect(cmd).toContain('StrictHostKeyChecking=accept-new')
  })
})

describe('runGit', () => {
  it('reports success and output for git --version', async () => {
    const res = await runGit(['--version'])
    expect(res.code).toBe(0)
    expect(res.stdout).toMatch(/git version/)
  })

  it('runs an init/add/commit cycle in a temp repo', async () => {
    const dir = tempDir()
    expect((await runGit(['init', '-b', 'main'], { cwd: dir })).code).toBe(0)
    writeFileSync(path.join(dir, 'README.md'), '# vault\n')
    expect((await runGit(['add', 'README.md'], { cwd: dir })).code).toBe(0)
    const commit = await runGit(
      ['-c', 'user.email=t@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init'],
      { cwd: dir }
    )
    expect(commit.code).toBe(0)
    const head = await runGit(['rev-parse', 'HEAD'], { cwd: dir })
    expect(head.code).toBe(0)
    expect(head.stdout.trim()).toMatch(/^[0-9a-f]{40}$/)
  })

  it('surfaces a non-zero exit with stderr for a failing command', async () => {
    const dir = tempDir() // not a git repo
    const res = await runGit(['rev-parse', 'HEAD'], { cwd: dir })
    expect(res.code).not.toBe(0)
    expect(res.stderr.length).toBeGreaterThan(0)
  })
})
