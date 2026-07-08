import { buildApp } from './app.js'

// Bind to localhost by default (master plan: production defaults).
const host = process.env.SECOND_BRAIN_WEB_HOST ?? '127.0.0.1'
const port = Number(process.env.SECOND_BRAIN_WEB_PORT ?? 8722)

const app = buildApp()

try {
  await app.listen({ host, port })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
