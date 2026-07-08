import { buildApp } from './app.js'
import { ConfigError, loadConfig } from './config.js'

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
  await app.listen({ host: config.host, port: config.port })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
