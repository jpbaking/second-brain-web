import { buildApp } from './app.js'
import { ConfigError, loadConfig } from './config.js'
import { MigrationError, prepareDatabases } from './migrations.js'

let config
try {
  config = loadConfig()
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`setup error: ${err.message}`)
    process.exit(1)
  }
  throw err
}

const app = buildApp(config)

try {
  prepareDatabases(config.dataDir)
  await app.listen({ host: config.host, port: config.port })
} catch (err) {
  if (err instanceof MigrationError) {
    console.error(`database error: ${err.message}`)
    process.exit(1)
  }
  app.log.error(err)
  process.exit(1)
}
