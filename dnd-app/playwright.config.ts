import { defineConfig, devices } from '@playwright/test'

// Non-blocking end-to-end smoke harness (suggestions-log 2026-06-23). Drives the
// build:web output served by `preview:web`. Kept small + deterministic (no live
// BMO Pi). Wired as a separate CI job (pull_request / manual) so it does not gate
// the main dnd-app CI until the suite is proven stable.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run preview:web -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
})
