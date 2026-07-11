import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { importDeployKey, loadConfig } from '../src/config.js'

const scratch: string[] = []
function scratchDir (): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-sshimport-'))
  scratch.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('importDeployKey', () => {
  it('copies a mounted key to <dataDir>/ssh/deploy_key at mode 600', () => {
    const base = scratchDir()
    const dataDir = path.join(base, 'data')
    mkdirSync(path.join(dataDir, 'ssh'), { recursive: true, mode: 0o700 })

    const src = path.join(base, 'mounted_key')
    writeFileSync(src, 'PRIVATE-KEY-BODY\n', { mode: 0o644 })

    importDeployKey(dataDir, { SECOND_BRAIN_WEB_SSH_KEY_PATH: src })

    const dest = path.join(dataDir, 'ssh', 'deploy_key')
    expect(readFileSync(dest, 'utf8')).toBe('PRIVATE-KEY-BODY\n')
    expect(statSync(dest).mode & 0o777).toBe(0o600)
  })

  it('copies a .pub sibling at mode 644 when present', () => {
    const base = scratchDir()
    const dataDir = path.join(base, 'data')
    mkdirSync(path.join(dataDir, 'ssh'), { recursive: true, mode: 0o700 })

    const src = path.join(base, 'mounted_key')
    writeFileSync(src, 'PRIV\n')
    writeFileSync(`${src}.pub`, 'ssh-ed25519 AAAA test\n')

    importDeployKey(dataDir, { SECOND_BRAIN_WEB_SSH_KEY_PATH: src })

    const destPub = path.join(dataDir, 'ssh', 'deploy_key.pub')
    expect(readFileSync(destPub, 'utf8')).toMatch(/^ssh-ed25519 /)
    expect(statSync(destPub).mode & 0o777).toBe(0o644)
  })

  it('is a no-op when the env var is unset or the file is missing', () => {
    const base = scratchDir()
    const dataDir = path.join(base, 'data')
    mkdirSync(path.join(dataDir, 'ssh'), { recursive: true, mode: 0o700 })

    expect(() => importDeployKey(dataDir, {})).not.toThrow()
    expect(() => importDeployKey(dataDir, { SECOND_BRAIN_WEB_SSH_KEY_PATH: '' })).not.toThrow()
    expect(() => importDeployKey(dataDir, {
      SECOND_BRAIN_WEB_SSH_KEY_PATH: path.join(base, 'nope'),
    })).not.toThrow()
  })

  it('is applied by loadConfig during data-root preparation', () => {
    const base = scratchDir()
    const dataDir = path.join(base, 'data')
    const src = path.join(base, 'mounted_key')
    writeFileSync(src, 'FROM-LOADCONFIG\n', { mode: 0o644 })

    loadConfig({
      SECOND_BRAIN_WEB_DATA_DIR: dataDir,
      SECOND_BRAIN_WEB_SSH_KEY_PATH: src,
    })

    const dest = path.join(dataDir, 'ssh', 'deploy_key')
    expect(readFileSync(dest, 'utf8')).toBe('FROM-LOADCONFIG\n')
    expect(statSync(dest).mode & 0o777).toBe(0o600)
  })

  it('tolerates the source already being the destination path', () => {
    const base = scratchDir()
    const dataDir = path.join(base, 'data')
    const dest = path.join(dataDir, 'ssh', 'deploy_key')
    mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 })
    writeFileSync(dest, 'SELF\n')
    chmodSync(dest, 0o600)

    expect(() => importDeployKey(dataDir, { SECOND_BRAIN_WEB_SSH_KEY_PATH: dest })).not.toThrow()
    expect(readFileSync(dest, 'utf8')).toBe('SELF\n')
    expect(statSync(dest).mode & 0o777).toBe(0o600)
  })
})
