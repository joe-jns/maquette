import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Captures des icônes et des dégradés (relecture du design).
 * npx electron-vite build && SHOTS=<dossier> npx playwright test -c e2e-shots icons
 */
const out = process.env.SHOTS ?? join(tmpdir(), 'maquette-shots')
const scene = resolve('e2e/fixtures/scene.maquette')
const shot = (page: Page, name: string) => page.screenshot({ path: join(out, `${name}.png`) })

test('icônes et dégradés', async () => {
  const app = await electron.launch({
    args: ['.', scene],
    env: { ...process.env, MAQUETTE_E2E: '1', MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-shots-')) },
  })
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())!.setContentSize(1440, 900))
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.waitForTimeout(600)

  // Une carte faite par Claude : fond en dégradé, icônes Lucide de couleurs différentes.
  const ids = await page.evaluate(() => {
    const s = (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { id: string }[] }; dispatch(o: unknown[], l: string): { ids: Record<string, string> } } } }).__maquetteStore
    const pageId = s.getState().doc.pages[0]!.id
    return s.getState().dispatch([
      { op: 'create', parent: pageId, node: { id: '$c', type: 'frame', name: 'Carte', x: 0, y: 700, width: 360, height: 200, radius: 16,
        fills: ['linear-gradient(135deg, #1E1B4B, #7C3AED 60%, #F472B6)'], layout: { mode: 'auto', direction: 'row', gap: 20, padding: [32, 32, 32, 32], align: 'center' } } },
      { op: 'create', parent: '$c', node: { id: '$i1', type: 'icon', icon: 'shopping-cart', color: '#FFFFFF', width: 40, height: 40 } },
      { op: 'create', parent: '$c', node: { type: 'icon', icon: 'heart', color: '#F9A8D4', width: 40, height: 40, strokeWidth: 1.5 } },
      { op: 'create', parent: '$c', node: { type: 'icon', icon: 'star', color: '#FDE68A', width: 40, height: 40 } },
      { op: 'create', parent: '$c', node: { type: 'icon', icon: 'arrow-right', color: '#FFFFFF', width: 40, height: 40 } },
    ], 'carte').ids
  })
  await page.keyboard.press('Shift+1')
  await page.waitForTimeout(300)
  await page.evaluate((id) => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select([id]), ids.$i1!)
  await page.waitForTimeout(300)
  await shot(page, 'icones-1-selection')
  await page.getByTestId('right-panel').getByRole('button', { name: 'Icône', exact: true }).click()
  await page.getByTestId('right-panel').getByRole('searchbox').fill('flèche')
  await page.waitForTimeout(200)
  await shot(page, 'icones-2-selecteur-panneau')
  await page.keyboard.press('Escape')

  await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Shift+I')
  await page.waitForTimeout(200)
  await page.mouse.move(720, 700)
  await shot(page, 'icones-3-selecteur-barre')
  await page.keyboard.press('Escape')

  await page.evaluate(() => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select(['rBleu1']))
  await page.waitForTimeout(300)
  await page.getByTestId('right-panel').getByRole('button', { name: 'Passer en dégradé' }).hover()
  await page.waitForTimeout(600)
  await shot(page, 'degrade-0-couleur-unie')
  await page.evaluate((id) => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select([id]), ids.$c!)
  await page.waitForTimeout(300)
  await page.locator('.panel-right').evaluate((el) => (el.scrollTop = el.scrollHeight))
  await shot(page, 'degrade-1-panneau')
  await app.close()
})
