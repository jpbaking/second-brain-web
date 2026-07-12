import { buildApp } from './app.js'
import { ConfigError, loadConfig } from './config.js'
import { MigrationError, prepareDatabases } from './migrations.js'
import { ProviderProvisioningError, provisionProviderProfiles } from './providers/provisioning.js'
import { assertSecretPermissions, SecretPermissionError } from './security/secret-permissions.js'
import { configureLogging } from './logging.js'

try {
  configureLogging()
} catch (err) {
  process.stderr.write(`logging setup error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
  process.exit(1)
}

let config
try {
  config = loadConfig()
  // Refuse to start if any secret file is group/other-accessible (m12-04).
  assertSecretPermissions(config.dataDir)
} catch (err) {
  if (err instanceof ConfigError || err instanceof SecretPermissionError) {
    console.error(`setup error: ${err.message}`)
    process.exit(1)
  }
  throw err
}

const app = buildApp(config)

try {
  prepareDatabases(config.dataDir)
  provisionProviderProfiles(config.dataDir)
  await app.listen({ host: config.host, port: config.port })
} catch (err) {
  if (err instanceof MigrationError) {
    console.error(`database error: ${err.message}`)
    process.exit(1)
  }
  if (err instanceof ProviderProvisioningError) {
    console.error(`setup error: ${err.message}`)
    process.exit(1)
  }
  app.log.error(err)
  process.exit(1)
}
