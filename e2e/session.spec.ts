import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

const addRect = (page: Page, name: string) =>
  page.evaluate((n) => {
    const store = (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { id: string }[] }; dispatch(ops: unknown[], label: string): unknown } } }).__maquetteStore
    store.getState().dispatch([{ op: 'create', parent: store.getState().doc.pages[0]!.id, node: { type: 'shape', shape: 'rectangle', name: n, x: 10, y: 10, width: 50, height: 50 } }], 'test')
  }, name)

const names = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { children: { name: string }[] }[] } } } }).__maquetteStore.getState().doc.pages[0]!.children.map((c) => c.name))

/** Remplace la boîte de dialogue native par une réponse fixe, et note les messages posés. */
const answerDialog = (app: ElectronApplication, response: number) =>
  app.evaluate(({ dialog }, r) => {
    const asked: string[] = []
    ;(globalThis as unknown as { __asked: string[] }).__asked = asked
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const opts = (args.length > 1 ? args[1] : args[0]) as { message: string }
      asked.push(opts.message)
      return { response: r, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  }, response)

test('copie de secours : l’app plante, au lancement suivant le travail est restauré', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'maquette-session-'))
  const first = await launch([], { MAQUETTE_USER_DATA: userData })
  await expect(first.page.getByTestId('canvas')).toBeVisible()
  await addRect(first.page, 'Travail perdu ?')
  await first.page.waitForTimeout(6000)
  first.app.process().kill()

  const second = await launch([], { MAQUETTE_USER_DATA: userData })
  try {
    const banner = second.page.getByTestId('recovery')
    await expect(banner).toContainText('Sans titre')
    await banner.getByRole('button', { name: 'Restaurer' }).click()
    await expect(banner).toHaveCount(0)
    expect(await names(second.page)).toContain('Travail perdu ?')
    await expect(second.page).toHaveTitle(/•/)
  } finally {
    await second.app.close()
  }

  // Restaurée puis fermée sans changement : plus rien à proposer.
  const third = await launch([], { MAQUETTE_USER_DATA: userData })
  try {
    await expect(third.page.getByTestId('canvas')).toBeVisible()
    await third.page.waitForTimeout(500)
    await expect(third.page.getByTestId('recovery')).toHaveCount(0)
  } finally {
    await third.app.close()
  }
})

test('fermeture avec changements : question ; Annuler garde la fenêtre, Ne pas enregistrer ferme', async () => {
  const { app, page } = await launch([], { MAQUETTE_E2E_GUARD: '1' })
  await expect(page.getByTestId('canvas')).toBeVisible()
  await addRect(page, 'Modifié')
  await expect(page).toHaveTitle(/•/)

  await answerDialog(app, 2)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.isVisible())?.close())
  await page.waitForTimeout(300)
  expect(page.isClosed()).toBe(false)
  expect(await app.evaluate(() => (globalThis as unknown as { __asked: string[] }).__asked)).toEqual(['Enregistrer les modifications de Sans titre ?'])

  await answerDialog(app, 1)
  const closed = app.waitForEvent('close')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.isVisible())?.close())
  await closed
})
