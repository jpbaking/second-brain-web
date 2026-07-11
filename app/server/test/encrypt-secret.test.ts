import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { decryptSecret } from '../src/secrets/crypto.js'

const cli = 'src/cli/encrypt-secret.ts'

function runCli (plaintext: string, secretsKey?: string) {
  const env = { ...process.env }
  delete env.SECOND_BRAIN_WEB_SECRETS_KEY
  if (secretsKey !== undefined) env.SECOND_BRAIN_WEB_SECRETS_KEY = secretsKey

  return spawnSync(process.execPath, ['--import', 'tsx', cli], {
    cwd: new URL('..', import.meta.url),
    env,
    input: plaintext,
    encoding: 'utf8'
  })
}

describe('encrypt-secret CLI', () => {
  it('reads plaintext from stdin and emits decryptable v1 ciphertext', () => {
    const result = runCli('sk-provider-secret\nwith-newline', 'test-master-key')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const ciphertext = result.stdout.trimEnd()
    expect(ciphertext).toMatch(/^v1:/)
    expect(decryptSecret(ciphertext, {
      SECOND_BRAIN_WEB_SECRETS_KEY: 'test-master-key'
    })).toBe('sk-provider-secret\nwith-newline')
  })

  it('fails actionably when the secrets key is missing', () => {
    const result = runCli('never-encrypted')

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('encrypt-secret: SECOND_BRAIN_WEB_SECRETS_KEY is not set')
  })
})
