import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Vault detection checks (phase-003 Clone Flow). Confirms a checkout looks like
 * the Second Brain vault by the presence of its structural marker files.
 */
export const VAULT_MARKERS = [
  'README.md',
  '.clinerules/00-role.md',
  '.clinerules/10-structure.md',
  'memory/index.md',
  'library/catalog.md',
  'scripts/health.py',
] as const

export interface VaultMarker {
  path: string
  present: boolean
}

export interface VaultDetection {
  /** True only when every marker is present. */
  present: boolean
  markers: VaultMarker[]
  missing: string[]
}

export function detectVault (workspacePath: string): VaultDetection {
  const markers: VaultMarker[] = VAULT_MARKERS.map((marker) => ({
    path: marker,
    present: existsSync(path.join(workspacePath, marker)),
  }))
  const missing = markers.filter((m) => !m.present).map((m) => m.path)
  return { present: missing.length === 0, markers, missing }
}
