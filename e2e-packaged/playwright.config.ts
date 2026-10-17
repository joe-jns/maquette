import { defineConfig } from '@playwright/test'

// Vérification de l'app empaquetée (npm run dist d'abord) : npx playwright test -c e2e-packaged
export default defineConfig({ testDir: '.', timeout: 60_000, workers: 1 })
