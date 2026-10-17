import { defineConfig } from '@playwright/test'

/** Banc d'essai de montée en charge : `npx electron-vite build && npx playwright test -c bench`. */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 15 * 60_000,
  workers: 1,
  reporter: [['list']],
})
