import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { agentGitEnv, enterVaultCwd } from '../src/agent/cline-runner.js'
import { deployKeyPath, vaultWorkspacePath } from '../src/vault/config.js'
import { buildGitSshCommand } from '../src/vault/git.js'

// m39: the claude-code agent inherits process.cwd(); enterVaultCwd points it at
// the vault checkout so the agent operates on the vault, not the install dir.
describe('enterVaultCwd', () => {
  const origCwd = process.cwd()
  afterEach(() => process.chdir(origCwd))

  it('chdirs into the vault workspace when it exists', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'sbw-cwd-'))
    const vault = vaultWorkspacePath(dataDir)
    mkdirSync(vault, { recursive: true })
    try {
      expect(enterVaultCwd(dataDir)).toBe(true)
      expect(realpathSync(process.cwd())).toBe(realpathSync(vault))
    } finally {
      process.chdir(origCwd)
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('is a no-op when the vault does not exist yet', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'sbw-cwd-'))
    try {
      const before = process.cwd()
      expect(enterVaultCwd(dataDir)).toBe(false)
      expect(process.cwd()).toBe(before)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})

describe('agentGitEnv', () => {
  it('pins agent Git to the canonical deploy key without interactive prompts', () => {
    const dataDir = '/data/root'
    expect(agentGitEnv(dataDir)).toEqual({
      GIT_SSH_COMMAND: buildGitSshCommand(deployKeyPath(dataDir)),
      GIT_TERMINAL_PROMPT: '0',
    })
  })
})
