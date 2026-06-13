import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 0 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Console reporter in CI so the job logs show per-test progress (the html
  // reporter prints nothing, which made CI hangs impossible to diagnose).
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'fr-FR',
    trace: 'on-first-retry',
    actionTimeout: 10000,
    // The production build (served via `vite preview`) registers a PWA service
    // worker that would intercept API calls and serve the SPA fallback, racing
    // with — and bypassing — Playwright's request mocks. Block it so every
    // request goes through page.route, matching dev-server behaviour.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 14'] },
    },
  ],
  webServer: {
    // Serve a production build via `vite preview` instead of the dev server.
    // The on-demand dev compiler is pathologically slow on the CPU-limited CI
    // runner (single worker); a prebuilt static app loads instantly and makes
    // runs fast and deterministic. Locally, reuseExistingServer means an
    // already-running dev server (`npm run dev`) is reused, so no build occurs.
    command: 'npm run build && npm run preview -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
})
