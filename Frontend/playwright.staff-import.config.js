import process from 'node:process'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'staff-import.spec.js',
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://127.0.0.1:5204',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5204 --strictPort',
    env: { VITE_API_BASE_URL: '/api' },
    url: 'http://127.0.0.1:5204',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
