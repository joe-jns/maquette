import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Deux programmes : l'app (index) et le relais MCP lancé par Claude Code (relay).
        input: { index: resolve('src/main/index.ts'), relay: resolve('src/mcp-relay/relay.ts') },
      },
    },
  },
  preload: {},
  renderer: { plugins: [react()] },
})
