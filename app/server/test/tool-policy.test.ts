import { describe, expect, it } from 'vitest'
import {
  evaluateTool,
  isProtectedLibraryWrite,
  isMoveOnlyCommand,
  normaliseVaultPath,
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

  it('enforces read-only preset by denying mutating tools', () => {
    expect(evaluateTool({ toolName: 'editor', input: { path: 'reports/summary.md' } }, 'read-only').decision).toBe('deny')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'ls' } }, 'read-only').decision).toBe('deny')
    // Read tools still allowed
    expect(evaluateTool({ toolName: 'search', input: {} }, 'read-only').decision).toBe('allow')
    // Unknown tools still ask
    expect(evaluateTool({ toolName: 'some_tool', input: {} }, 'read-only').decision).toBe('ask')
  })

  it('enforces normal preset by asking for mutating tools', () => {
    expect(evaluateTool({ toolName: 'editor', input: { path: 'reports/summary.md' } }, 'normal').decision).toBe('ask')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'ls' } }, 'normal').decision).toBe('ask')
  })

  it('enforces high-trust preset by allowing mutating tools', () => {
    expect(evaluateTool({ toolName: 'editor', input: { path: 'reports/summary.md' } }, 'high-trust').decision).toBe('allow')
    expect(evaluateTool({ toolName: 'bash', input: { command: 'ls' } }, 'high-trust').decision).toBe('allow')
    // Library writes are STILL denied
    expect(evaluateTool({ toolName: 'editor', input: { path: 'library/original.md' } }, 'high-trust').decision).toBe('deny')
  })
})
