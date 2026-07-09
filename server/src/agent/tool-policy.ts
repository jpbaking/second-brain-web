import type { ApprovalPreset } from './chat-store.js'

/**
 * Mandatory `library/` tool-policy guard (phase-003 Library Original Protection;
 * phase-004; spike m00-09). The vault's own PreToolUse hook does NOT fire under
 * the Cline SDK, so this app-side guard is the ONLY enforcement of the vault's
 * strongest invariant: files under `library/` are immutable originals — only
 * catalogs may be written, and only move/rename (mv / git mv) may relocate them.
 *
 * A false deny is safe (the agent reports it and stops); a false allow corrupts
 * an irreplaceable original, so ambiguous cases fail closed.
 */

export type ToolDecision = 'allow' | 'deny' | 'ask'

export interface ToolPolicyResult {
  decision: ToolDecision
  reason?: string
}

export interface ToolApprovalRequest {
  toolName: string
  input?: Record<string, unknown> | null
}

/** File-mutating tools whose `path`/target is subject to the library rule. */
const WRITE_TOOLS = new Set(['editor', 'write_file', 'write_to_file', 'new_file', 'apply_diff', 'replace_in_file'])
/** Read-only tools that are safe to auto-approve. */
const READ_TOOLS = new Set(['search', 'read', 'read_file', 'list_files', 'list_code_definition_names'])

export function isMutatingTool(name: string): boolean {
  return WRITE_TOOLS.has(name) || name === 'bash' || name === 'execute_command'
}

/**
 * Lexically normalise a path (no filesystem access) so traversal cannot smuggle
 * a write under `library/` past the check, or out of it. Resolves `.`/`..`,
 * collapses slashes, and normalises backslashes. Relative and absolute both
 * occur in SDK tool input (spike m00-09).
 */
export function normaliseVaultPath (raw: string): string {
  const absolute = /^([/\\]|[A-Za-z]:[/\\])/.test(raw)
  const parts = raw.replace(/\\/g, '/').split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop()
      else if (!absolute) out.push('..')
      continue
    }
    out.push(part)
  }
  return (absolute ? '/' : '') + out.join('/')
}

/** True when the normalised path has a `library` directory component. */
export function isUnderLibrary (normalised: string): boolean {
  return normalised.split('/').includes('library')
}

/** True when the file is a catalog (`catalog.md`), the one writable name. */
export function isCatalogPath (normalised: string): boolean {
  const base = normalised.split('/').pop() ?? ''
  return base.toLowerCase() === 'catalog.md'
}

/** A write to this path violates the library rule (under library, not a catalog). */
export function isProtectedLibraryWrite (rawPath: string): boolean {
  const norm = normaliseVaultPath(rawPath)
  return isUnderLibrary(norm) && !isCatalogPath(norm)
}

/** Only `mv` / `git mv` relocate originals — the sole permitted shell mutation. */
export function isMoveOnlyCommand (command: string): boolean {
  return /^\s*(git\s+mv|mv)\s+\S/.test(command)
}

/**
 * A shell command references a `library/` path. Fails closed: any library
 * reference that is not a pure move and not catalog-only is treated as a
 * potential write and denied. (Reads under `library/` should use the read
 * tools, not bash.)
 */
export function commandTouchesLibrary (command: string): boolean {
  return /(^|[\s"'=/])library\//.test(command)
}

function commandOnlyTouchesCatalogs (command: string): boolean {
  const refs = command.match(/library\/[^\s"';|&>]*/g) ?? []
  return refs.length > 0 && refs.every((r) => isCatalogPath(normaliseVaultPath(r)))
}

/**
 * The full guard decision for one tool request. Wire this into the SDK's
 * `requestToolApproval`: `deny` refuses hard, `allow` auto-approves, `ask`
 * routes to human approval (m5a-07). Unknown tools are never silently
 * auto-approved — they fall through to `ask`.
 */
export function evaluateTool (req: ToolApprovalRequest, preset: ApprovalPreset = 'normal'): ToolPolicyResult {
  const name = req.toolName
  const input = req.input ?? {}

  if (WRITE_TOOLS.has(name)) {
    const rawPath = typeof input.path === 'string' ? input.path : ''
    if (isProtectedLibraryWrite(rawPath)) {
      return { decision: 'deny', reason: 'library/ originals are immutable; only catalogs may be edited' }
    }
    if (preset === 'read-only') return { decision: 'deny', reason: 'session preset is read-only' }
    if (preset === 'high-trust') return { decision: 'allow' }
    return { decision: 'ask' }
  }

  if (name === 'bash' || name === 'execute_command') {
    const command = typeof input.command === 'string' ? input.command : ''
    if (commandTouchesLibrary(command) && !isMoveOnlyCommand(command) && !commandOnlyTouchesCatalogs(command)) {
      return { decision: 'deny', reason: 'under library/ only move/rename (mv, git mv) and catalog writes are allowed' }
    }
    if (preset === 'read-only') return { decision: 'deny', reason: 'session preset is read-only' }
    if (preset === 'high-trust') return { decision: 'allow' }
    return { decision: 'ask' }
  }

  if (READ_TOOLS.has(name)) return { decision: 'allow' }

  // Unknown/unlisted tools must NOT be silently auto-approved (findings m00-10).
  return { decision: 'ask' }
}

/**
 * Explicit per-tool autoApprove policy for `ClineCore.create`. Set explicitly
 * because the SDK default auto-approves unlisted tools, which is too permissive
 * (findings m00-10). The `requestToolApproval` callback (evaluateTool) is the
 * real enforcement; this just ensures file/shell tools are routed through it.
 */
export const TOOL_POLICIES = {
  editor: { autoApprove: false },
  write_to_file: { autoApprove: false },
  replace_in_file: { autoApprove: false },
  apply_diff: { autoApprove: false },
  new_file: { autoApprove: false },
  bash: { autoApprove: false },
  execute_command: { autoApprove: false },
  search: { autoApprove: true },
  read_file: { autoApprove: true },
  fetch: { enabled: false },
} as const
