import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../src/agent/system-prompt.js'

describe('buildSystemPrompt vault contract', () => {
  it('routes through AGENTS.md and carries the validation and Git invariants', () => {
    const prompt = buildSystemPrompt('/srv/vault')
    expect(prompt).toContain('Read AGENTS.md before any vault task')
    expect(prompt).toContain('.clinerules/50-version-control.md')
    expect(prompt).toContain('.clinerules/workflows/')
    expect(prompt).toContain('.cline/skills/')
    expect(prompt).toContain('python3 scripts/health.py')
    expect(prompt).toContain('python3 scripts/validate_commit.py')
    expect(prompt).toContain('memory/log.md is append-only')
    expect(prompt).toContain('Never push unless the principal explicitly asks')
    expect(prompt).toContain('/srv/vault')
  })
})
