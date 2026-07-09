import { chmodSync, mkdtempSync, statSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigError, DATA_SUBDIRS, loadConfig } from '../src/config.js'

const scratch: string[] = []
function tempDir (): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-config-'))
  scratch.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('loadConfig', () => {
  it('fails with an actionable error when the data dir is not set', () => {
    expect(() => loadConfig({})).toThrow(ConfigError)
    expect(() => loadConfig({})).toThrow(/SECOND_BRAIN_WEB_DATA_DIR/)
  })

  it('creates the full private layout under the data dir', () => {
    const dir = path.join(tempDir(), 'data')
    const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: dir })
    expect(config.dataDir).toBe(dir)
    expect(statSync(dir).mode & 0o077).toBe(0)
    for (const sub of DATA_SUBDIRS) {
      expect(existsSync(path.join(dir, sub))).toBe(true)
      expect(statSync(path.join(dir, sub)).mode & 0o077).toBe(0)
    }
  })

  it('refuses a world-readable data dir', () => {
    const dir = path.join(tempDir(), 'data')
    loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: dir })
    chmodSync(dir, 0o755)
    expect(() => loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: dir })).toThrow(/chmod 700/)
  })

  it('defaults to localhost and validates the port', () => {
    const dir = path.join(tempDir(), 'data')
    const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: dir })
    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(8722)
    expect(() =>
      loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: dir, SECOND_BRAIN_WEB_PORT: 'nope' })
    ).toThrow(/valid port/)
  })
})
