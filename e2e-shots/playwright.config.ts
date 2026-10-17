import { defineConfig } from '@playwright/test'

// Captures de l'interface pour relecture du design (pas des tests de comportement).
export default defineConfig({ testDir: '.', timeout: 120_000, workers: 1 })
