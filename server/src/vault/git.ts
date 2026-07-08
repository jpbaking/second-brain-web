import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Run git as a child process. argv is passed directly (no shell), so remote
 * URLs and refs can never be interpreted as shell. When a deploy key is given,
 * git uses it via GIT_SSH_COMMAND with IdentitiesOnly so it never falls back to
 * the host's default keys. Never prompts for credentials.
 */

export interface GitResult {
  code: number
  stdout: string
  stderr: string
}

export interface RunGitOptions {
  cwd?: string
  keyPath?: string
  timeoutMs?: number
}

/** Build the GIT_SSH_COMMAND for a given deploy-key path. */
export function buildGitSshCommand (keyPath: string): string {
  return `ssh -i "${keyPath}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`
}

export async function runGit (args: string[], opts: RunGitOptions = {}): Promise<GitResult> {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  if (opts.keyPath !== undefined) {
    env.GIT_SSH_COMMAND = buildGitSshCommand(opts.keyPath)
  }

  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: opts.cwd,
      env,
      timeout: opts.timeoutMs ?? 120_000,
      maxBuffer: 16 * 1024 * 1024,
    })
    return { code: 0, stdout, stderr }
  } catch (err) {
    const e = err as { code?: number | string, stdout?: string, stderr?: string, message?: string }
    return {
      code: typeof e.code === 'number' ? e.code : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? '',
    }
  }
}
