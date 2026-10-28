import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** Captures de la nouvelle disposition : onglets Claude/Layers à gauche, Variables et Direction dans la barre. */
const out = process.env.SHOTS ?? join(tmpdir(), 'maquette-shots')
const scene = resolve('e2e/fixtures/scene.maquette')
const select = (page: Page, ids: string[]) =>
  page.evaluate((s) => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select(s), ids)
const shot = (page: Page, name: string) => page.screenshot({ path: join(out, `${name}.png`) })

test('disposition à onglets', async () => {
  const app = await electron.launch({ args: ['.', scene], env: { ...process.env, MAQUETTE_E2E: '1', MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-shots-')) } })
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())!.setContentSize(1440, 900))
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.getByRole('tab', { name: 'Layers' }).click()
  await page.waitForTimeout(500)
  await shot(page, 'a-calques')
  await page.getByRole('tab', { name: 'Claude' }).click()
  await page.waitForTimeout(300)
  await shot(page, 'b-claude')
  await page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { dispatch(ops: unknown[], label: string): void } } }).__maquetteStore.getState().dispatch([
    { op: 'style.color.set', name: 'Ground', value: '#F6F1E8' },
    { op: 'style.color.set', name: 'Ink', value: '#1E1A16' },
    { op: 'style.color.set', name: 'Accent', value: '#C2410C' },
    { op: 'style.text.set', name: 'Heading 1', fontFamily: 'Inter', fontWeight: 700, fontStyle: 'normal', fontSize: 64, lineHeight: 1.1, letterSpacing: -0.02 },
    { op: 'style.text.set', name: 'Body', fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal', fontSize: 18, lineHeight: 1.5, letterSpacing: 0 },
  ], 'capture'))
  await page.getByRole('button', { name: 'Variables' }).click()
  await page.waitForTimeout(300)
  await shot(page, 'c-variables')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Direction', exact: true }).click()
  await page.waitForTimeout(300)
  await shot(page, 'd-direction')
  await page.keyboard.press('Escape')
  await select(page, ['tTitre'])
  await page.waitForTimeout(300)
  await shot(page, 'e-selection')
  await app.close()
})
