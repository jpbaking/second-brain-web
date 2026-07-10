import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Workflow shortcut expansion (milestone 5A; spike m00-08 / findings m00-10 #3).
 * The Cline SDK does NOT expand slash commands, so the app reads the vault's
 * `.clinerules/workflows/<name>.md` and sends it as a normal message with a
 * fixed prefix. Workflow files auto-load from the checkout, so we only read.
 */

const WORKFLOWS_SUBDIR = path.join('.clinerules', 'workflows')
const WORKFLOW_PREFIX = 'Run the following workflow now.\n\n'

export class WorkflowNotFoundError extends Error {}

export function workflowsDir (vaultCwd: string): string {
  return path.join(vaultCwd, WORKFLOWS_SUBDIR)
}

/** Available workflow names (basename without `.md`), sorted. Empty if none. */
export function listWorkflows (vaultCwd: string): string[] {
  try {
    return readdirSync(workflowsDir(vaultCwd))
      .filter(f => f.endsWith('.md'))
      .map(f => f.slice(0, -3))
      .sort()
  } catch {
    return []
  }
}

/**
 * Expand a workflow into the message to send. Accepts a bare name or a
 * `/name` shortcut. Rejects traversal, and throws {@link WorkflowNotFoundError}
 * when the file is missing.
 */
export function expandWorkflow (vaultCwd: string, name: string): string {
  const safe = name.replace(/^\/+/, '').trim()
  if (safe === '' || safe.includes('/') || safe.includes('\\') || safe.includes('..')) {
    throw new Error(`invalid workflow name: ${name}`)
  }
  const file = path.join(workflowsDir(vaultCwd), `${safe}.md`)
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    throw new WorkflowNotFoundError(`unknown workflow: ${safe}`)
  }
  return WORKFLOW_PREFIX + content
}
