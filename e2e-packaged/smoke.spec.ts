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
  } finally {
    await app.close()
  }
})
