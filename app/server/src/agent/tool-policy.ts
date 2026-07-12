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
/** Read-only tools over the vault: auto-allowed in every mode except Chat. */
const READ_TOOLS = new Set(['search', 'read', 'read_file', 'list_files', 'list_code_definition_names'])
/**
 * `web__search` / `web__fetch` are the MCP web tools (m48): network reads
 * against SearXNG / the open web, never the vault — safe in every mode.
 */
const WEB_TOOLS = new Set(['web__search', 'web__fetch'])

export function isMutatingTool (name: string): boolean {
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

/**
 * The sole permitted shell mutation involving originals: one plain `mv` or
 * `git mv`, from inbox/ into a dated library/YYYY/ shard. Shell composition is
 * rejected so a valid-looking move cannot smuggle a second operation.
 */
export function isMoveOnlyCommand (command: string): boolean {
  if (/[;&|<>\n\r`]/.test(command) || /\$\(/.test(command)) return false
  const words = command.trim().split(/\s+/)
  const offset = words[0] === 'git' && words[1] === 'mv' ? 2 : words[0] === 'mv' ? 1 : -1
  if (offset < 0) return false
  const args = words.slice(offset).filter(word => word !== '--')
  if (args.length !== 2 || args.some(word => word.startsWith('-'))) return false
  const [source = '', destination = ''] = args.map(normaliseVaultPath)
  const sourceParts = source.split('/')
  const destinationParts = destination.split('/')
  const inboxAt = sourceParts.lastIndexOf('inbox')
  const libraryAt = destinationParts.lastIndexOf('library')
  return inboxAt >= 0 && inboxAt < sourceParts.length - 1 &&
    libraryAt >= 0 && /^\d{4}$/.test(destinationParts[libraryAt + 1] ?? '') &&
    libraryAt + 2 < destinationParts.length
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

/* --- Approval-mode helpers (m53) ------------------------------------- */

/** The vault's own history is the safety net — nothing may touch it. */
export function touchesGitDir (rawPathOrCommand: string): boolean {
  return /(^|[\s"'=/\\])\.git([/\\]|\b)/.test(rawPathOrCommand)
}

/**
 * A path escapes the vault: absolute, home-relative, or traversing above the
 * cwd (the agent runs with cwd = the vault checkout). Fails open to "outside"
 * on anything ambiguous.
 */
export function isOutsideVaultPath (raw: string, vaultCwd?: string): boolean {
  if (raw.startsWith('~')) return true
  const norm = normaliseVaultPath(raw)
  if (/^([/\\]|[A-Za-z]:)/.test(norm)) {
    if (vaultCwd === undefined) return true
    const vault = normaliseVaultPath(vaultCwd).replace(/\/$/, '')
    return norm !== vault && !norm.startsWith(`${vault}/`)
  }
  return norm === '..' || norm.startsWith('../')
}

/**
 * A shell command references locations outside the vault: any absolute or
 * home-relative path token, or upward traversal. `cd` counts like any other
 * reference. Heuristic and fail-closed: ambiguous commands read as outside.
 */
export function commandReachesOutsideVault (command: string, vaultCwd?: string): boolean {
  const pathRefs = [...command.matchAll(/(^|[\s"'=])((?:~|\/)[^\s"']*)/g)].map(match => match[2] ?? '')
  return pathRefs.some(ref => isOutsideVaultPath(ref, vaultCwd)) || /(^|[\s"'=/])\.\.(\/|\s|$)/.test(command)
}

/**
 * Read-only "safe" commands: every segment of a pipeline/sequence starts with
 * a whitelisted read verb (or a read-only git subcommand). Anything else —
 * including redirection — is not safe.
 */
const SAFE_COMMAND_VERBS = new Set(['ls', 'cat', 'head', 'tail', 'grep', 'rg', 'wc', 'pwd', 'stat', 'file', 'tree', 'du', 'find', 'diff', 'sort', 'uniq', 'cut', 'awk', 'sed'])
const SAFE_GIT_SUBCOMMANDS = new Set(['status', 'log', 'diff', 'show', 'blame', 'shortlog', 'describe', 'rev-parse'])

function isSafeReadGitCommand (words: string[]): boolean {
  const subcommand = words[1] ?? ''
  if (SAFE_GIT_SUBCOMMANDS.has(subcommand)) return true
  if (subcommand !== 'branch') return false
  const args = words.slice(2)
  if (args.length === 0) return true
  const readFlags = new Set(['--list', '-l', '--show-current', '--all', '-a', '--remotes', '-r', '--verbose', '-v', '-vv', '--no-color', '--color'])
  return args.every(arg => readFlags.has(arg) || arg.startsWith('--contains=') || arg.startsWith('--no-contains=') || arg.startsWith('--merged=') || arg.startsWith('--no-merged='))
}

export function isSafeReadCommand (command: string): boolean {
  if (/[<>]/.test(command)) return false // redirection writes files
  if (/\bfind\b[^|;&]*-(delete|exec|ok)\b/.test(command)) return false
  if (/\b(sed|awk)\b[^|;&]*-i/.test(command)) return false // in-place edits
  const segments = command.split(/\|\||&&|;|\|/).map(s => s.trim()).filter(s => s !== '')
  if (segments.length === 0) return false
  return segments.every(segment => {
    const words = segment.split(/\s+/)
    const verb = words[0] ?? ''
    if (verb === 'git') return isSafeReadGitCommand(words)
    return SAFE_COMMAND_VERBS.has(verb)
  })
}

/**
 * Commands that delete or irreversibly rewrite state — filesystem operations
 * are unattended only in Auto; forbidden Git operations are handled below.
 */
export function isDestructiveCommand (command: string): boolean {
  return /\b(rm|rmdir|unlink|shred|truncate)\b/.test(command) ||
    /\bfind\b[^|;&]*-delete\b/.test(command) ||
    /\bgit\s+(reset\s+--hard|clean\b|checkout\s+--\s|restore\b|push\s+.*(--force|-f)\b)/.test(command)
}

/** Vault rules forbid rewriting/cleaning Git history in every approval mode. */
export function isForbiddenGitCommand (command: string): boolean {
  return /\bgit\s+(?:-[^\s]+\s+)*(?:reset\b|clean\b|rebase\b)/.test(command) ||
    /\bgit\s+(?:-[^\s]+\s+)*commit\b[^|;&]*(?:--amend)\b/.test(command) ||
    /\bgit\b[^|;&]*--squash\b/.test(command) ||
    /\bgit\s+(?:-[^\s]+\s+)*push\b[^|;&]*(?:--force(?:-with-lease)?|-f|\s\+[^\s]+)/.test(command)
}

/** Pushing always needs a fresh principal decision, including in Auto mode. */
export function isGitPushCommand (command: string): boolean {
  return /\bgit\s+(?:-[^\s]+\s+)*push\b/.test(command)
}

/** Bounded, human-readable summary of what a tool call intends to do (m52). */
export interface ToolInputDetail {
  path?: string
  command?: string
  preview?: string
  truncated: boolean
}

const PREVIEW_MAX_CHARS = 2000

/**
 * Summarise a tool request's input for the approval card: the target path or
 * command verbatim, plus a size-capped preview of the content/diff being
 * written (or, for unknown tools, of the whole input as JSON). Persisted on
 * the approval_request event, so keep it bounded — file writes can be huge.
 */
export function summariseToolInput (toolName: string, input: Record<string, unknown> | null | undefined): ToolInputDetail {
  const detail: ToolInputDetail = { truncated: false }
  const source = input ?? {}
  const rest: Record<string, unknown> = { ...source }

  if (typeof source.path === 'string' && source.path !== '') {
    detail.path = source.path
    delete rest.path
  }
  if ((toolName === 'bash' || toolName === 'execute_command') && typeof source.command === 'string') {
    detail.command = source.command.length > PREVIEW_MAX_CHARS ? source.command.slice(0, PREVIEW_MAX_CHARS) : source.command
    detail.truncated = source.command.length > PREVIEW_MAX_CHARS
    delete rest.command
  }

  // Content-ish fields first (editor/write/diff tools), else remaining input.
  let preview: string | undefined
  for (const key of ['content', 'diff', 'text', 'contents']) {
    if (typeof rest[key] === 'string' && rest[key] !== '') {
      preview = rest[key]
      delete rest[key]
      break
    }
  }
  if (preview === undefined && Object.keys(rest).length > 0) {
    try {
      preview = JSON.stringify(rest, null, 2)
    } catch { /* unserialisable input: leave the preview out */ }
    if (preview === '{}') preview = undefined
  }
  if (preview !== undefined) {
    if (preview.length > PREVIEW_MAX_CHARS) {
      detail.preview = preview.slice(0, PREVIEW_MAX_CHARS)
      detail.truncated = true
    } else {
      detail.preview = preview
    }
  }
  return detail
}

/**
 * The full guard decision for one tool request (m53 mode matrix). Wire this
 * into the SDK's `requestToolApproval`: `deny` refuses hard, `allow`
 * auto-approves, `ask` routes to human approval (m5a-07).
 *
 * Invariants in EVERY mode: the library/ originals guard denies, `.git` is
 * protected, and unknown tools are never silently auto-approved (m00-10).
 */
export function evaluateTool (req: ToolApprovalRequest, preset: ApprovalPreset = 'normal', vaultCwd?: string): ToolPolicyResult {
  const name = req.toolName
  const input = req.input ?? {}

  // Web reads never touch the vault: safe in every mode, Chat included.
  if (WEB_TOOLS.has(name)) return { decision: 'allow' }

  if (READ_TOOLS.has(name)) {
    if (preset === 'chat') return { decision: 'ask', reason: 'chat mode: vault access needs permission' }
    return { decision: 'allow' }
  }

  if (WRITE_TOOLS.has(name)) {
    const rawPath = typeof input.path === 'string' ? input.path : ''
    if (isProtectedLibraryWrite(rawPath)) {
      return { decision: 'deny', reason: 'library/ originals are immutable; only catalogs may be edited' }
    }
    if (touchesGitDir(rawPath)) {
      return { decision: 'deny', reason: 'the vault .git directory is protected' }
    }
    if (preset === 'chat') return { decision: 'ask', reason: 'chat mode: vault access needs permission' }
    if (preset === 'manual') return { decision: 'ask' }
    // normal / auto: in-vault edits are git-reversible; outside the vault asks.
    if (isOutsideVaultPath(rawPath, vaultCwd)) return { decision: 'ask', reason: 'write outside the vault' }
    return { decision: 'allow' }
  }

  if (name === 'bash' || name === 'execute_command') {
    const command = typeof input.command === 'string' ? input.command : ''
    if (commandTouchesLibrary(command) && !isMoveOnlyCommand(command) && !isSafeReadCommand(command)) {
      return { decision: 'deny', reason: 'library/ originals are immutable; shell access is limited to reads or one inbox-to-library/YYYY move' }
    }
    if (isForbiddenGitCommand(command)) return { decision: 'deny', reason: 'vault Git history must not be rewritten or cleaned' }
    if (touchesGitDir(command) && (isDestructiveCommand(command) || !isSafeReadCommand(command))) {
      return { decision: 'deny', reason: 'the vault .git directory is protected' }
    }
    if (preset === 'chat') return { decision: 'ask', reason: 'chat mode: vault access needs permission' }
    if (preset === 'manual') {
      return isSafeReadCommand(command) ? { decision: 'allow' } : { decision: 'ask' }
    }
    if (commandReachesOutsideVault(command, vaultCwd)) return { decision: 'ask', reason: 'command reaches outside the vault' }
    if (isGitPushCommand(command)) return { decision: 'ask', reason: 'pushing requires the principal\'s explicit permission for this task' }
    if (isDestructiveCommand(command) && preset !== 'auto') return { decision: 'ask', reason: 'destructive command' }
    return { decision: 'allow' }
  }

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
  // Vault reads must enter the callback so Chat mode can require consent.
  search: { autoApprove: false },
  read: { autoApprove: false },
  read_file: { autoApprove: false },
  list_files: { autoApprove: false },
  list_code_definition_names: { autoApprove: false },
  web__search: { autoApprove: true },
  web__fetch: { autoApprove: true },
  fetch: { enabled: false },
} as const
