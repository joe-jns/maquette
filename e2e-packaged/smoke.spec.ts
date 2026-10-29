import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** L'app telle qu'installée : fichier ouvert, taste-skill (ressources hors archive), contrôle qualité. */
test('app installable : ouvre un fichier, tire des directions, contrôle un cadre', async () => {
  const app = await electron.launch({
    executablePath: resolve('dist/win-unpacked/Maquette.exe'),
    args: [resolve('e2e/fixtures/scene.maquette')],
    env: { ...process.env, MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-pack-')), MAQUETTE_E2E: '1' },
  })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('[data-node-id="fHero1"]')).toBeVisible()
    const r = await page.evaluate(() => window.maquette.taste.options({ sector: 'architecture', brief: 'atelier' }))
    expect(r.ok).toBe(true)
    const check = await page.evaluate(() =>
      window.maquette.taste.check((window as unknown as { __maquetteStore: { getState(): { doc: never } } }).__maquetteStore.getState().doc, 'fHero1'),
    )
    expect(check).not.toBeNull()
    // Guides et styles de design (vendor/design, ressources hors archive).
    expect(await page.evaluate(() => window.maquette.design.read('maquette/methode.md'))).toContain('appliquer')
  } finally {
    await app.close()
  }
})

test('app installable : le relais MCP démarre depuis l’archive de l’app', async () => {
  const { spawn } = await import('node:child_process')
  const relay = spawn(resolve('dist/win-unpacked/Maquette.exe'), [resolve('dist/win-unpacked/resources/app.asar/out/main/relay.js')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  let out = ''
  relay.stdout.on('data', (d) => (out += d))
  relay.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n')
  await expect.poll(() => out, { timeout: 15000 }).toContain('"serverInfo":{"name":"maquette"')
  relay.kill()
})

test('app installable fermée : le relais lance Maquette.exe sans fenêtre, puis elle s’arrête seule', async () => {
  test.setTimeout(60_000)
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const env = {
    ...(process.env as Record<string, string>),
    ELECTRON_RUN_AS_NODE: '1',
    MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-packaged-')),
    MAQUETTE_PIPE: `\\\\.\\pipe\\maquette-packaged-${process.pid}`,
    MAQUETTE_HEADLESS_IDLE_MS: '3000',
  }
  const c = new Client({ name: 'packaged', version: '1' })
  await c.connect(new StdioClientTransport({ command: resolve('dist/win-unpacked/Maquette.exe'), args: [resolve('dist/win-unpacked/resources/app.asar/out/main/relay.js')], env }))
  try {
    const r = await c.callTool({ name: 'fichier', arguments: { action: 'etat' } })
    const text = (r.content as { text?: string }[])[0]?.text ?? ''
    expect(JSON.parse(text)).toMatchObject({ visible: false })
  } finally {
    await c.close()
  }
  // Sans appel, l'app cachée s'arrête : plus aucun Maquette.exe lancé depuis ce dossier.
  await new Promise((r) => setTimeout(r, 8000))
  const { execSync } = await import('node:child_process')
  const list = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name=\'Maquette.exe\'\\" | Where-Object { $_.ExecutablePath -like \'*win-unpacked*\' }).Count"').toString().trim()
  expect(Number(list || 0)).toBe(0)
})
