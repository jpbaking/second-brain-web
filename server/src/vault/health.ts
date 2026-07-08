import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Run the vault's health check (phase-003 Health Check). The script always
 * exits 0, so we never trust the exit code — the result is derived from parsing
 * stdout text.
 */

export interface HealthResult {
  available: boolean
  rawText: string
  issueCount: number | null
  sections: string[]
  ranAt: string
  message?: string
}

export interface HealthOptions {
  now?: Date
  timeoutMs?: number
}

function parseIssueCount (text: string): number | null {
  const m = /(\d+)\s+(issues?|problems?|errors?|warnings?)/i.exec(text)
  if (m !== null && m[1] !== undefined) return Number(m[1])
  if (/\b(no issues|all (?:checks )?pass(?:ed)?|healthy|all good)\b/i.test(text)) return 0
  return null
}

function parseSections (text: string): string[] {
  const sections: string[] = []
  for (const line of text.split('\n')) {
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    if (heading?.[1] !== undefined) {
      sections.push(heading[1])
      continue
    }
    const colon = /^([A-Za-z][\w ]{1,40}):\s*$/.exec(line)
    if (colon?.[1] !== undefined) sections.push(colon[1])
  }
  return sections
}

function summarise (rawText: string, ranAt: string): HealthResult {
  return {
    available: true,
    rawText,
    issueCount: parseIssueCount(rawText),
    sections: parseSections(rawText),
    ranAt,
  }
}

export async function runHealthCheck (workspacePath: string, opts: HealthOptions = {}): Promise<HealthResult> {
  const ranAt = (opts.now ?? new Date()).toISOString()
  const script = path.join(workspacePath, 'scripts', 'health.py')
  if (!existsSync(script)) {
    return { available: false, rawText: '', issueCount: null, sections: [], ranAt, message: 'scripts/health.py not found in the vault.' }
  }

  try {
    const { stdout } = await execFileAsync('python3', ['scripts/health.py'], {
      cwd: workspacePath,
      timeout: opts.timeoutMs ?? 60_000,
      maxBuffer: 16 * 1024 * 1024,
    })
    return summarise(stdout, ranAt)
  } catch (err) {
    // The script should exit 0; if it did not, still use any stdout it produced.
    const e = err as { stdout?: string, stderr?: string, message?: string }
    if (e.stdout !== undefined && e.stdout.length > 0) return summarise(e.stdout, ranAt)
    return { available: false, rawText: '', issueCount: null, sections: [], ranAt, message: e.stderr ?? e.message ?? 'health check failed to run.' }
  }
}
