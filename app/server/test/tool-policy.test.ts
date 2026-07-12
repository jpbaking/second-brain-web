import { describe, expect, it } from 'vitest'
import {
  evaluateTool,
  isProtectedLibraryWrite,
  isMoveOnlyCommand,
  normaliseVaultPath,
  summariseToolInput,
  isSafeReadCommand,
  isDestructiveCommand,
  isOutsideVaultPath,
  commandReachesOutsideVault,
} from '../src/agent/tool-policy.js'

describe('normaliseVaultPath', () => {
  it('strips ./ and collapses slashes', () => {
    expect(normaliseVaultPath('./library//2026/x.txt')).toBe('library/2026/x.txt')
  })
  it('resolves .. lexically without escaping into library', () => {
    expect(normaliseVaultPath('notes/../library/2026/x.txt')).toBe('library/2026/x.txt')
    expect(normaliseVaultPath('library/2026/../2025/x.txt')).toBe('library/2025/x.txt')
    expect(normaliseVaultPath('library/../outside.txt')).toBe('outside.txt')
  })
  it('preserves an absolute leading slash', () => {
    expect(normaliseVaultPath('/vault/library/2026/x.txt')).toBe('/vault/library/2026/x.txt')
  })
})

describe('isProtectedLibraryWrite', () => {
  it('protects non-catalog originals (relative and absolute)', () => {
    expect(isProtectedLibraryWrite('library/2026/original.txt')).toBe(true)
    expect(isProtectedLibraryWrite('/home/app/vault/library/2026/original.txt')).toBe(true)
    expect(isProtectedLibraryWrite('./notes/../library/2026/original.txt')).toBe(true)
  })
  it('permits catalogs', () => {
    expect(isProtectedLibraryWrite('library/2026/catalog.md')).toBe(false)
    expect(isProtectedLibraryWrite('library/catalog.md')).toBe(false)
  })
  it('ignores paths outside library', () => {
    expect(isProtectedLibraryWrite('reports/2026/summary.md')).toBe(false)
    expect(isProtectedLibraryWrite('library/../escaped.txt')).toBe(false)
  })
})

describe('isMoveOnlyCommand', () => {
  it('recognises mv and git mv', () => {
    expect(isMoveOnlyCommand('mv library/a.txt library/b.txt')).toBe(true)
    expect(isMoveOnlyCommand('  git mv library/a.txt library/b.txt')).toBe(true)
  })
  it('rejects other commands', () => {
    expect(isMoveOnlyCommand('rm library/a.txt')).toBe(false)
    expect(isMoveOnlyCommand('echo hi > library/a.txt')).toBe(false)
  })
})

describe('evaluateTool — the guard decision', () => {
  it('DENIES an editor write to a library original (relative and absolute)', () => {
    expect(evaluateTool({ toolName: 'editor', input: { path: 'library/2026/original.txt' } }).decision).toBe('deny')
    expect(evaluateTool({ toolName: 'editor', input: { path: '/srv/vault/library/2026/o.txt' } }).decision).toBe('deny')
    // Also covers alternate write-tool names the SDK may use.
    expect(evaluateTool({ toolName: 'write_to_file', input: { path: 'library/2026/o.txt' } }).decision).toBe('deny')
  })

  it('ALLOWS a catalog edit (not denied)', () => {
    expect(evaluateTool({ toolName: 'editor', input: { path: 'library/2026/catalog.md' } }).decision).not.toBe('deny')
  })

  it('DENIES a bash write under library but ALLOWS mv / git mv and catalog writes', () => {
    expect(evaluateTool({ toolName: 'bash', input: { command: 'rm library/2026/original.txt' } }).decision).toBe('deny')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'echo x >> library/2026/original.txt' } }).decision).toBe('deny')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'mv library/2026/a.txt library/2026/b.txt' } }).decision).not.toBe('deny')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'git mv library/2026/a.txt library/2026/b.txt' } }).decision).not.toBe('deny')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'echo done >> library/2026/catalog.md' } }).decision).not.toBe('deny')
  })

  it('allows bash that does not touch library', () => {
    expect(evaluateTool({ toolName: 'bash', input: { command: 'ls reports/' } }).decision).not.toBe('deny')
  })

  it('never silently auto-approves an unknown tool', () => {
    expect(evaluateTool({ toolName: 'some_new_tool', input: {} }).decision).toBe('ask')
  })

  it('auto-approves read-only tools', () => {
    expect(evaluateTool({ toolName: 'search', input: { query: 'x' } }).decision).toBe('allow')
  })

  it('auto-approves the MCP web tools in every mode, chat included (m48/m53)', () => {
    expect(evaluateTool({ toolName: 'web__search', input: { query: 'x' } }).decision).toBe('allow')
    expect(evaluateTool({ toolName: 'web__fetch', input: { url: 'https://x.example' } }).decision).toBe('allow')
    expect(evaluateTool({ toolName: 'web__search', input: { query: 'x' } }, 'manual').decision).toBe('allow')
    expect(evaluateTool({ toolName: 'web__search', input: { query: 'x' } }, 'chat').decision).toBe('allow')
  })

  it('manual mode: reads and safe commands run, everything else asks', () => {
    expect(evaluateTool({ toolName: 'search', input: {} }, 'manual').decision).toBe('allow')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'ls reports/ | head' } }, 'manual').decision).toBe('allow')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'git log --oneline' } }, 'manual').decision).toBe('allow')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'touch a.md' } }, 'manual').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'editor', input: { path: 'reports/summary.md' } }, 'manual').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'some_tool', input: {} }, 'manual').decision).toBe('ask')
  })

  it('normal mode: vault edits/commands run; destructive or outside asks', () => {
    expect(evaluateTool({ toolName: 'editor', input: { path: 'reports/summary.md' } }, 'normal').decision).toBe('allow')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'mkdir -p notes && touch notes/a.md' } }, 'normal').decision).toBe('allow')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'rm notes/a.md' } }, 'normal').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'git reset --hard HEAD~1' } }, 'normal').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'editor', input: { path: '/etc/hosts' } }, 'normal').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'editor', input: { path: '../outside.md' } }, 'normal').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'cat /etc/passwd' } }, 'normal').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'ls ~/Downloads' } }, 'normal').decision).toBe('ask')
  })

  it('auto mode: destructive vault commands run; outside the vault still asks', () => {
    expect(evaluateTool({ toolName: 'bash', input: { command: 'rm notes/a.md' } }, 'auto').decision).toBe('allow')
    expect(evaluateTool({ toolName: 'editor', input: { path: 'reports/summary.md' } }, 'auto').decision).toBe('allow')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'rm -rf /tmp/x' } }, 'auto').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'editor', input: { path: '/etc/hosts' } }, 'auto').decision).toBe('ask')
    // Library originals are STILL denied
    expect(evaluateTool({ toolName: 'editor', input: { path: 'library/original.md' } }, 'auto').decision).toBe('deny')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'rm library/2026/original.txt' } }, 'auto').decision).toBe('deny')
  })

  it('chat mode: any vault access asks, even reads', () => {
    expect(evaluateTool({ toolName: 'read_file', input: { path: 'memory/employer.md' } }, 'chat').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'search', input: { query: 'x' } }, 'chat').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'ls' } }, 'chat').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'editor', input: { path: 'a.md' } }, 'chat').decision).toBe('ask')
  })

  it('protects .git in every mode', () => {
    expect(evaluateTool({ toolName: 'editor', input: { path: '.git/config' } }, 'auto').decision).toBe('deny')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'rm -rf .git' } }, 'auto').decision).toBe('deny')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'ls .git' } }, 'manual').decision).toBe('allow')
  })
})

describe('mode helper predicates', () => {
  it('classifies safe read commands', () => {
    expect(isSafeReadCommand('grep -rn TODO memory/ | head -5')).toBe(true)
    expect(isSafeReadCommand('git status && git diff')).toBe(true)
    expect(isSafeReadCommand('echo hi > file.md')).toBe(false)
    expect(isSafeReadCommand('find . -name "*.tmp" -delete')).toBe(false)
    expect(isSafeReadCommand('sed -i s/a/b/ x.md')).toBe(false)
    expect(isSafeReadCommand('git push')).toBe(false)
  })

  it('classifies destructive commands', () => {
    expect(isDestructiveCommand('rm -rf notes')).toBe(true)
    expect(isDestructiveCommand('git clean -fd')).toBe(true)
    expect(isDestructiveCommand('git restore .')).toBe(true)
    expect(isDestructiveCommand('mkdir new && mv a b')).toBe(false)
  })

  it('detects paths and commands reaching outside the vault', () => {
    expect(isOutsideVaultPath('/etc/hosts')).toBe(true)
    expect(isOutsideVaultPath('~/notes.md')).toBe(true)
    expect(isOutsideVaultPath('../sibling.md')).toBe(true)
    expect(isOutsideVaultPath('memory/notes/a.md')).toBe(false)
    expect(commandReachesOutsideVault('cat /etc/passwd')).toBe(true)
    expect(commandReachesOutsideVault('ls ../..')).toBe(true)
    expect(commandReachesOutsideVault('ls memory/notes')).toBe(false)
  })
})

describe('summariseToolInput', () => {
  it('extracts path and content preview for write tools', () => {
    const d = summariseToolInput('editor', { path: 'memory/notes/reminders.md', content: '- [ ] car wash 10am' })
    expect(d).toEqual({ path: 'memory/notes/reminders.md', preview: '- [ ] car wash 10am', truncated: false })
  })

  it('extracts the command for shell tools', () => {
    const d = summariseToolInput('execute_command', { command: 'git status' })
    expect(d.command).toBe('git status')
    expect(d.preview).toBeUndefined()
  })

  it('caps huge content and flags truncation', () => {
    const d = summariseToolInput('write_file', { path: 'a.md', content: 'x'.repeat(5000) })
    expect(d.preview?.length).toBe(2000)
    expect(d.truncated).toBe(true)
  })

  it('falls back to a JSON preview of unknown input, and empty stays empty', () => {
    const d = summariseToolInput('mystery_tool', { target: 'z', count: 3 })
    expect(d.preview).toContain('"target": "z"')
    expect(summariseToolInput('mystery_tool', {})).toEqual({ truncated: false })
    expect(summariseToolInput('mystery_tool', null)).toEqual({ truncated: false })
  })
})
