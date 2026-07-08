import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const serverPort = Number(process.env.SECOND_BRAIN_WEB_PORT ?? 8722)

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${serverPort}`,
    },
  },
})
