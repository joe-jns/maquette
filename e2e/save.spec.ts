import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

test('modifier, enregistrer puis annuler, dans un dossier avec espaces et accents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dossier é test '))
  const file = join(dir, 'démo.maquette')
  await copyFile(join(__dirname, 'fixtures', 'demo.maquette'), file)

  const { app, page } = await launch([file])
  await expect(page.locator('[data-node-id="tTitre"]')).toHaveText('Bonjour Maquette')

  await page.evaluate(() => {
    const store = (window as unknown as { __maquetteStore: { getState(): { dispatch(ops: unknown[], label: string): unknown } } }).__maquetteStore
    store.getState().dispatch([{ op: 'update', id: 'tTitre', set: { content: 'Modifié ✓' } }], 'test')
  })
  await expect(page.locator('[data-node-id="tTitre"]')).toHaveText('Modifié ✓')
  await expect(page).toHaveTitle('démo.maquette • — Maquette')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())!.webContents.send('menu', 'save'))
  await expect(page).toHaveTitle('démo.maquette — Maquette')
  expect(await readFile(file, 'utf8')).toContain('"content": "Modifié ✓"')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())!.webContents.send('menu', 'undo'))
  await expect(page.locator('[data-node-id="tTitre"]')).toHaveText('Bonjour Maquette')
  await expect(page).toHaveTitle('démo.maquette • — Maquette')
  await app.close()
})
