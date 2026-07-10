import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runGit } from '../src/vault/git.js'
import { readGitStatus } from '../src/vault/git-status.js'

const scratch: string[] = []
const GIT_ID = ['-c', 'user.email=review@example.com', '-c', 'user.name=Review Test']

async function repo (): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-review-'))
  scratch.push(dir)
  await runGit(['init', '-b', 'main'], { cwd: dir })
  mkdirSync(path.join(dir, 'memory'))
  writeFileSync(path.join(dir, 'memory', 'modified.md'), 'before\n')
  writeFileSync(path.join(dir, 'memory', 'renamed.md'), 'rename me\n')
  writeFileSync(path.join(dir, 'memory', 'deleted.md'), 'delete me\n')
  await runGit(['add', '.'], { cwd: dir })
  await runGit([...GIT_ID, 'commit', '-m', 'initial vault'], { cwd: dir })
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('vault changed-file review', () => {
  it('detects modified, renamed, deleted, and untracked files after a workflow', async () => {
    const dir = await repo()
    writeFileSync(path.join(dir, 'memory', 'modified.md'), 'after\n')
    renameSync(path.join(dir, 'memory', 'renamed.md'), path.join(dir, 'memory', 'moved.md'))
    unlinkSync(path.join(dir, 'memory', 'deleted.md'))
    mkdirSync(path.join(dir, 'inbox', 'uploads'), { recursive: true })
    writeFileSync(path.join(dir, 'inbox', 'uploads', 'new.txt'), 'new original\n')
    await runGit(['add', '-A', 'memory'], { cwd: dir })

    const review = await readGitStatus(dir, { includeDiff: true })
    expect(review.dirty).toBe(true)
    expect(review.changedFiles).toContain('memory/modified.md')
    expect(review.changedFiles).toContain('memory/renamed.md -> memory/moved.md')
    expect(review.changedFiles).toContain('memory/deleted.md')
    expect(review.changedFiles).toContain('inbox/uploads/new.txt')
    expect(review.diffSummary).toContain('memory/modified.md')
    expect(review.diffSummary).toContain('inbox/uploads/new.txt | new file')
  })

  it('does not run or invent a diff summary for a clean vault', async () => {
    const review = await readGitStatus(await repo(), { includeDiff: true })
    expect(review.changedFiles).toEqual([])
    expect(review.diffSummary).toBeNull()
  })
})
