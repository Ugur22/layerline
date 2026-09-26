import { defineConfig } from '@playwright/test'

const PORT = 5199

export default defineConfig({
  testDir: './e2e',
  // One dataset is shared by every test, so they must not run in parallel.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: 'retain-on-failure',
    launchOptions: {
      // Headless Chrome has no GPU; software WebGL lets MapLibre render.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `npm run dev -- --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}`,
    // Always start our own server: a developer's long-running one may be stale.
    reuseExistingServer: false,
    // Hermetic basemap: e2e serves a blank style itself (see e2e/slice.spec.ts), so a third-party
    // outage cannot fail the suite.
    env: { VITE_BASEMAP_STYLE_URL: `http://127.0.0.1:${String(PORT)}/e2e-blank-style.json` },
    timeout: 60_000,
  },
})
