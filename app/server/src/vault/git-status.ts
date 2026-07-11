import { runGit } from './git.js'
import { readFileSync, existsSync, lstatSync } from 'node:fs'
import path from 'node:path'

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
  diffSummary: string | null
  fileDiffs?: Record<string, string>
  fileContents?: Record<string, string>
}

const NOT_A_REPO: GitStatus = {
  isRepo: false,
  branch: null,
  commit: null,
  subject: null,
  dirty: false,
  changedFiles: [],
  diffSummary: null,
}

export interface GitStatusOptions {
  /**
   * Also compute a `git diff HEAD --stat` summary. Off by default: only the
   * review-before-commit flow needs it, and the frequently-polled command
   * centre / status endpoints should not spawn an extra git process each poll.
   */
  includeDiff?: boolean
  /**
   * Also compute per-file unified diffs for all changed files.
   */
  includeFileDiffs?: boolean
  /**
   * Also load the full text content of changed files.
   */
  includeFileContents?: boolean
}

export async function readGitStatus (workspacePath: string, options: GitStatusOptions = {}): Promise<GitStatus> {
  const inside = await runGit(['-C', workspacePath, 'rev-parse', '--is-inside-work-tree'])
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') {
    return { ...NOT_A_REPO }
  }

  const branch = await runGit(['-C', workspacePath, 'rev-parse', '--abbrev-ref', 'HEAD'])
  const commit = await runGit(['-C', workspacePath, 'rev-parse', 'HEAD'])
  const subject = await runGit(['-C', workspacePath, 'log', '-1', '--pretty=%s'])
  const status = await runGit(['-C', workspacePath, 'status', '--porcelain', '--untracked-files=all'])

  // Porcelain v1: two status chars, a space, then the path.
  const changedFiles = status.stdout
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3))

  let diffSummary: string | null = null
  if (options.includeDiff === true && changedFiles.length > 0) {
    const [diff, untracked] = await Promise.all([
      runGit(['-C', workspacePath, 'diff', 'HEAD', '--stat']),
      runGit(['-C', workspacePath, 'ls-files', '--others', '--exclude-standard']),
    ])
    if (diff.code === 0 && untracked.code === 0) {
      const parts = [diff.stdout.trim()]
      const newFiles = untracked.stdout.split('\n').filter(Boolean)
      if (newFiles.length > 0) {
        parts.push(newFiles.map(file => `${file} | new file`).join('\n'))
      }
      diffSummary = parts.filter(Boolean).join('\n')
    }
  }

  let fileDiffs: Record<string, string> | undefined
  if (options.includeFileDiffs === true && changedFiles.length > 0) {
    fileDiffs = {}
    const lines = status.stdout.split('\n').filter((l) => l.length > 3)
    for (const line of lines) {
      const code = line.slice(0, 2)
      const pathPart = line.slice(3)
      const isUntracked = code === '??'

      if (isUntracked) {
        const res = await runGit(['-C', workspacePath, 'diff', '--no-index', '/dev/null', pathPart])
        fileDiffs[pathPart] = res.stdout.trim()
      } else {
        const parts = pathPart.split(' -> ')
        const args = ['-C', workspacePath, 'diff', 'HEAD', '--']
        if (parts.length === 2) {
          args.push(parts[0] as string, parts[1] as string)
        } else {
          args.push(pathPart)
        }
        const res = await runGit(args)
        fileDiffs[pathPart] = res.stdout.trim()
      }
    }
  }

  let fileContents: Record<string, string> | undefined
  if (options.includeFileContents === true && changedFiles.length > 0) {
    fileContents = {}
    for (const cf of changedFiles) {
      const parts = cf.split(' -> ')
      const newPath = parts.length === 2 ? (parts[1] as string) : (parts[0] as string)
      const fullPath = path.join(workspacePath, newPath)
      if (existsSync(fullPath) && lstatSync(fullPath).isFile()) {
        fileContents[cf] = readFileSync(fullPath, 'utf8')
      }
    }
  }

  const result: GitStatus = {
    isRepo: true,
    branch: branch.code === 0 ? branch.stdout.trim() : null,
    commit: commit.code === 0 ? commit.stdout.trim() : null,
    subject: subject.code === 0 ? subject.stdout.trim() : null,
    dirty: changedFiles.length > 0,
    changedFiles,
    diffSummary,
  }
  if (fileDiffs) result.fileDiffs = fileDiffs
  if (fileContents) result.fileContents = fileContents
  return result
}
