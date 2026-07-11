import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FullConfig } from '@playwright/test'

// We require the compiled dist to test the real build as instructed by the playbook.
import { buildApp } from '../../server/dist/app.js'
import { loadConfig } from '../../server/dist/config.js'
import { prepareDatabases } from '../../server/dist/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../../server/dist/auth/bootstrap.js'

class FakeRunner {
  async start() { return { sessionId: 'sdk-1' } }
  async send() {}
  subscribe() { return () => {} }
  async readMessages() { return [] }
  async stop() {}
}

export default async function globalSetup(config: FullConfig) {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-e2e-'))
  const appConfig = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'), SECOND_BRAIN_WEB_SECRETS_KEY: 'test-key' })
  prepareDatabases(appConfig.dataDir)
  
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(appConfig.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: appConfig.secretsKey })
  
  // Expose the password and TOTP secret for tests to use
  process.env.E2E_PASSWORD = password
  process.env.E2E_TOTP_SECRET = state.totp.secretBase32
  process.env.E2E_DATA_DIR = root

  const runner = new FakeRunner()
  const app = buildApp(appConfig, { agentRunner: runner as any })
  
  const address = await app.listen({ port: 0, host: '127.0.0.1' })
  process.env.PLAYWRIGHT_TEST_BASE_URL = address

  return async () => {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
}
