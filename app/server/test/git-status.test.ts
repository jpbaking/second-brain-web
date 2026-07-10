import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runGit } from '../src/vault/git.js'
import { readGitStatus } from '../src/vault/git-status.js'

const scratch: string[] = []
const GIT_ID = ['-c', 'user.email=t@example.com', '-c', 'user.name=Test']

async function tempRepo (): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-gitstatus-'))
  scratch.push(dir)
  await runGit(['init', '-b', 'main'], { cwd: dir })
  writeFileSync(path.join(dir, 'README.md'), '# vault\n')
  await runGit(['add', '.'], { cwd: dir })
  await runGit([...GIT_ID, 'commit', '-m', 'init'], { cwd: dir })
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('readGitStatus', () => {
  it('reports not-a-repo for a plain directory', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sbw-notrepo-'))
    scratch.push(dir)
    const status = await readGitStatus(dir)
    expect(status.isRepo).toBe(false)
    expect(status.commit).toBeNull()
  })

  it('reports a clean repo with branch, commit, and subject', async () => {
    const status = await readGitStatus(await tempRepo())
    expect(status.isRepo).toBe(true)
    expect(status.branch).toBe('main')
    expect(status.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(status.subject).toBe('init')
    expect(status.dirty).toBe(false)
    expect(status.changedFiles).toEqual([])
  })

  it('reports dirty with the changed file after an edit', async () => {
    const dir = await tempRepo()
    writeFileSync(path.join(dir, 'NEW.md'), 'change\n')
    const status = await readGitStatus(dir)
    expect(status.dirty).toBe(true)
    expect(status.changedFiles).toContain('NEW.md')
  })
})
