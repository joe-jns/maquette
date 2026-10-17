import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Captures de tous les états de l'interface, pour relire le design (phase polish).
 * npx electron-vite build && SHOTS=<dossier> npx playwright test -c e2e-shots
 */
const out = process.env.SHOTS ?? join(tmpdir(), 'maquette-shots')
const scene = resolve('e2e/fixtures/scene.maquette')

async function open(args: string[] = []) {
  const app = await electron.launch({
    args: ['.', ...args],
    env: { ...process.env, MAQUETTE_E2E: '1', MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-shots-')) },
  })
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900))
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.waitForTimeout(600)
  return { app, page }
}
const select = (page: Page, ids: string[]) =>
  page.evaluate((s) => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select(s), ids)
const shot = (page: Page, name: string) => page.screenshot({ path: join(out, `${name}.png`) })

test('états de l’interface', async () => {
  test.setTimeout(120_000)
  const empty = await open()
  await shot(empty.page, '01-nouveau')
  await empty.app.close()

  const { app, page } = await open([scene])
  await shot(page, '02-document')
  await select(page, ['tTitre'])
  await page.waitForTimeout(300)
  await shot(page, '03-texte')
  await page.locator('.panel-right').evaluate((el) => (el.scrollTop = el.scrollHeight))
  await shot(page, '04-texte-bas')
  await select(page, ['fHero1'])
  await page.waitForTimeout(300)
  await shot(page, '05-cadre-auto')
  await select(page, ['rBleu1'])
  await page.waitForTimeout(300)
  await shot(page, '06-rectangle')
  await select(page, ['tTitre'])
  await page.locator('[data-font-trigger]').first().click()
  await page.waitForTimeout(500)
  await shot(page, '07-polices')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Direction' }).click()
  await shot(page, '08-direction')
  await page.getByRole('tab', { name: 'Design' }).click()
  await select(page, [])
  await page.locator('.page-list li').first().click({ button: 'right' })
  await shot(page, '09-menu-contextuel')
  await page.keyboard.press('Escape')
  await page.locator('.canvas').click({ position: { x: 600, y: 700 } })
  await page.keyboard.press('?')
  await page.waitForTimeout(300)
  await shot(page, '10-aide')
  await page.keyboard.press('Escape')
  await page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { showError(m: string): void } } }).__maquetteStore.getState().showError('Impossible d’ouvrir site.maquette : version future du format'))
  await shot(page, '11-bandeau')
  await app.close()
})
