import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { extendError } from 'error-extender'
import { AppError, asError } from '../errors.js'

/**
 * Workflow shortcut expansion (milestone 5A; spike m00-08 / findings m00-10 #3).
 * The Cline SDK does NOT expand slash commands, so the app reads the vault's
 * `.clinerules/workflows/<name>.md` and sends it as a normal message with a
 * fixed prefix. Workflow files auto-load from the checkout, so we only read.
 */

const WORKFLOWS_SUBDIR = path.join('.clinerules', 'workflows')
const WORKFLOW_PREFIX = 'Run the following workflow now.\n\n'

export const WorkflowNotFoundError = extendError('WorkflowNotFoundError', { parent: AppError })

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

export interface WorkflowSummary { name: string, description: string }

/** Workflow names plus the first prose paragraph after the Markdown heading. */
export function listWorkflowSummaries (vaultCwd: string): WorkflowSummary[] {
  return listWorkflows(vaultCwd).map(name => {
    try {
      const lines = readFileSync(path.join(workflowsDir(vaultCwd), `${name}.md`), 'utf8').split(/\r?\n/)
      let started = false
      const paragraph: string[] = []
      for (const line of lines) {
        const trimmed = line.trim()
        if (!started && (trimmed === '' || trimmed.startsWith('#'))) continue
        if (trimmed === '') break
        started = true
        paragraph.push(trimmed)
      }
      return { name, description: paragraph.join(' ').replace(/\s+/g, ' ') }
    } catch {
      return { name, description: '' }
    }
  })
}

/**
 * Expand a workflow into the message to send. Accepts a bare name or a
 * `/name` shortcut. Rejects traversal, and throws {@link WorkflowNotFoundError}
 * when the file is missing.
 */
export function expandWorkflow (vaultCwd: string, name: string, params?: Record<string, string>): string {
  const safe = name.replace(/^\/+/, '').trim()
  if (safe === '' || safe.includes('/') || safe.includes('\\') || safe.includes('..')) {
    throw new Error(`invalid workflow name: ${name}`)
  }
  const file = path.join(workflowsDir(vaultCwd), `${safe}.md`)
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch (err) {
    throw new WorkflowNotFoundError({ message: `unknown workflow: ${safe}`, cause: asError(err) })
  }
  let prefix = WORKFLOW_PREFIX
  if (params && Object.keys(params).length > 0) {
    prefix += '[Parameters]\n'
    for (const [k, v] of Object.entries(params)) {
      if (v) prefix += `${k}: ${v}\n`
    }
    prefix += '\n'
  }
  return prefix + content
}
