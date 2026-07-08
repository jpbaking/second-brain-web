import { runGit } from './git.js'

/**
 * Read the working-tree status of the vault checkout (phase-003 / roadmap M4):
 * branch, HEAD commit and subject, and whether the tree is dirty. Used by the
 * command center and before write workflows.
 */

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  commit: string | null
  subject: string | null
  dirty: boolean
  changedFiles: string[]
}

const NOT_A_REPO: GitStatus = {
  isRepo: false,
  branch: null,
  commit: null,
  subject: null,
  dirty: false,
  changedFiles: [],
}

export async function readGitStatus (workspacePath: string): Promise<GitStatus> {
  const inside = await runGit(['-C', workspacePath, 'rev-parse', '--is-inside-work-tree'])
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') {
    return { ...NOT_A_REPO }
  }

  const branch = await runGit(['-C', workspacePath, 'rev-parse', '--abbrev-ref', 'HEAD'])
  const commit = await runGit(['-C', workspacePath, 'rev-parse', 'HEAD'])
  const subject = await runGit(['-C', workspacePath, 'log', '-1', '--pretty=%s'])
  const status = await runGit(['-C', workspacePath, 'status', '--porcelain'])

  // Porcelain v1: two status chars, a space, then the path.
  const changedFiles = status.stdout
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3))

  return {
    isRepo: true,
    branch: branch.code === 0 ? branch.stdout.trim() : null,
    commit: commit.code === 0 ? commit.stdout.trim() : null,
    subject: subject.code === 0 ? subject.stdout.trim() : null,
    dirty: changedFiles.length > 0,
    changedFiles,
  }
}
