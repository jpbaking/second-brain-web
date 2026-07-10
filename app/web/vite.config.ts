import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Dev-server config. In development Vite owns the public port
 * (SECOND_BRAIN_WEB_PORT, default 8722) and the API server runs on port + 1
 * (the root `npm run dev` script applies the offset), so the same URL works in
 * both dev and production. To front the dev server with a TLS-terminating
 * proxy (e.g. nginx-proxy-manager), bind it with SECOND_BRAIN_WEB_HOST and
 * list the public hostname(s) in SECOND_BRAIN_WEB_DEV_ALLOWED_HOSTS
 * (comma-separated) so Vite accepts the proxied Host header.
 */

const host = process.env.SECOND_BRAIN_WEB_HOST ?? '127.0.0.1'
const serverPort = Number(process.env.SECOND_BRAIN_WEB_PORT ?? 8722)
const allowedHosts = (process.env.SECOND_BRAIN_WEB_DEV_ALLOWED_HOSTS ?? '')
  .split(',')
  .map(entry => entry.trim())
  .filter(entry => entry !== '')

export default defineConfig({
  plugins: [react()],
  server: {
    host,
    port: serverPort,
    ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
    proxy: {
      '/api': `http://${host}:${serverPort + 1}`,
    },
  },
})
