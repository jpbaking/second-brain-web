import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const script = path.join(repoRoot, 'scripts', 'generate-deploy-key.sh')

const scratch: string[] = []
function dataRoot (): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-deploy-'))
  scratch.push(dir)
  return path.join(dir, 'data')
}

interface Run { status: number, stdout: string, stderr: string }
function run (dataDir: string, args: string[] = []): Run {
  try {
    const stdout = execFileSync('bash', [script, ...args], {
      env: { ...process.env, SECOND_BRAIN_WEB_DATA_DIR: dataDir },
      encoding: 'utf8',
    })
    return { status: 0, stdout, stderr: '' }
  } catch (err) {
    const e = err as { status?: number, stdout?: string, stderr?: string }
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('generate-deploy-key.sh', () => {
  it('creates a 0600 ed25519 key on a fresh data root', () => {
    const dir = dataRoot()
    const res = run(dir)
    expect(res.status).toBe(0)
    const priv = path.join(dir, 'ssh', 'deploy_key')
    expect(statSync(priv).mode & 0o777).toBe(0o600)
    expect(readFileSync(priv, 'utf8')).toContain('OPENSSH PRIVATE KEY')
    expect(readFileSync(`${priv}.pub`, 'utf8')).toMatch(/^ssh-ed25519 /)
    expect(res.stdout).toMatch(/^ssh-ed25519 /m)
  })

  it('refuses to overwrite an existing key without --rotate', () => {
    const dir = dataRoot()
    run(dir)
    const priv = path.join(dir, 'ssh', 'deploy_key')
    const before = readFileSync(priv, 'utf8')

    const res = run(dir)
    expect(res.status).not.toBe(0)
    expect(res.stderr).toMatch(/--rotate/)
    // The existing key is untouched.
    expect(readFileSync(priv, 'utf8')).toBe(before)
  })

  it('replaces the key with --rotate and reports the old one invalid', () => {
    const dir = dataRoot()
    run(dir)
    const priv = path.join(dir, 'ssh', 'deploy_key')
    const before = readFileSync(`${priv}.pub`, 'utf8')

    const res = run(dir, ['--rotate'])
    expect(res.status).toBe(0)
    expect(res.stdout).toMatch(/invalidated/)
    expect(statSync(priv).mode & 0o777).toBe(0o600)
    // A genuinely different key was generated.
    expect(readFileSync(`${priv}.pub`, 'utf8')).not.toBe(before)
  })

  it('rejects unknown arguments', () => {
    const res = run(dataRoot(), ['--nope'])
    expect(res.status).not.toBe(0)
    expect(res.stderr).toMatch(/unknown argument/)
  })
})
