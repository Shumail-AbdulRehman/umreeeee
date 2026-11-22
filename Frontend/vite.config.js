import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { checkConversationApi } from './scripts/check-api-contract.mjs'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (process.env.NETLIFY === 'true') {
    const apiBase = (env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
    let valid = false
    try {
      const url = new URL(apiBase)
      valid = url.protocol === 'https:' && url.pathname === '/api' && !url.search && !url.hash && !url.username && !url.password
    } catch { /* Missing or malformed deployment URL. */ }
    if (!valid) throw new Error('Set VITE_API_BASE_URL in Netlify to your HTTPS backend URL ending in /api, then redeploy.')
    await checkConversationApi(apiBase)
  }
  return {
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    plugins: [
      tailwindcss(),
      react(),
      babel({ presets: [reactCompilerPreset()] })
    ],
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8000',
      },
    },
  }
})
