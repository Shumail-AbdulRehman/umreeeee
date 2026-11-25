import process from 'node:process'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'platform-owner.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5193',
    viewport: { width: 1440, height: 1000 },
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 5193 --strictPort',
    url: 'http://127.0.0.1:5193',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
