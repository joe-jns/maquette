import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

type Store = { getState(): { doc: { pages: { id: string; children: { id: string; name: string }[] }[] }; dispatch(ops: unknown[], label: string): unknown } }

const addRect = (page: Page, name: string) =>
  page.evaluate((n) => {
    const store = (window as unknown as { __maquetteStore: Store }).__maquetteStore
    store.getState().dispatch([{ op: 'create', parent: store.getState().doc.pages[0]!.id, node: { type: 'shape', shape: 'rectangle', name: n, x: 10, y: 10, width: 50, height: 50 } }], 'test')
  }, name)

const names = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: Store }).__maquetteStore.getState().doc.pages[0]!.children.map((c) => c.name))

const menu = (app: ElectronApplication, cmd: string) =>
  app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())!.webContents.send('menu', c), cmd)

/** Les boîtes natives sont remplacées par un mouchard : tout appel est noté (et répond « annuler »). */
async function spyNative(app: ElectronApplication, page: Page): Promise<() => Promise<string[]>> {
  await app.evaluate(({ dialog }) => {
    const calls: string[] = []
    ;(globalThis as unknown as { __native: string[] }).__native = calls
    const note = (name: string) => (...args: unknown[]) => {
      calls.push(`${name} ${JSON.stringify(args.at(-1))}`)
      return name === 'showMessageBoxSync' ? 0 : Promise.resolve({ response: 0, checkboxChecked: false })
    }
    dialog.showMessageBox = note('showMessageBox') as typeof dialog.showMessageBox
    dialog.showMessageBoxSync = note('showMessageBoxSync') as unknown as typeof dialog.showMessageBoxSync
    dialog.showErrorBox = ((title: string) => void calls.push(`showErrorBox ${title}`)) as typeof dialog.showErrorBox
  })
  // window.confirm / alert de la page : Playwright les signale par l'événement « dialog ».
  const pageDialogs: string[] = []
  page.on('dialog', (d) => {
    pageDialogs.push(`${d.type()} ${d.message()}`)
    void d.dismiss()
  })
  return async () => [...(await app.evaluate(() => (globalThis as unknown as { __native: string[] }).__native)), ...pageDialogs]
}

const DISCARD = 'Abandonner les modifications non enregistrées ?'

test('Nouveau avec un document modifié : question dans l’app ; Échap annule, « Abandonner » confirme', async () => {
  const { app, page } = await launch()
  try {
    await expect(page.getByTestId('canvas')).toBeVisible()
    const nativeCalls = await spyNative(app, page)
    await addRect(page, 'À garder')
    await expect(page).toHaveTitle(/•/)

    await menu(app, 'new')
    const dialog = page.getByRole('dialog', { name: DISCARD })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Bouton par défaut : « Annuler » (rien n'est perdu sur Entrée).
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused()
    // Les raccourcis du canevas ne passent pas sous la question.
    await page.evaluate(() => {
      const s = (window as unknown as { __maquetteStore: Store }).__maquetteStore.getState()
      ;(window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select([s.doc.pages[0]!.children[0]!.id])
    })
    await page.keyboard.press('Delete')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await names(page)).toEqual(['À garder'])
    await expect(page).toHaveTitle(/•/)

    await menu(app, 'new')
    await page.getByRole('dialog', { name: DISCARD }).getByRole('button', { name: 'Abandonner' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => names(page)).toEqual([])
    await expect(page).not.toHaveTitle(/•/)

    expect(await nativeCalls()).toEqual([])
  } finally {
    await app.close()
  }
})

test('file d’attente, focus piégé, clic sur le fond et Entrée', async () => {
  const { app, page } = await launch()
  try {
    await expect(page.getByTestId('canvas')).toBeVisible()
    const nativeCalls = await spyNative(app, page)
    await addRect(page, 'Toujours là')
    await menu(app, 'new')
    await menu(app, 'new')
    // Une seule question affichée à la fois.
    await expect(page.getByRole('dialog')).toHaveCount(1)
    const dialog = page.getByRole('dialog', { name: DISCARD })
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused()
    // Tab tourne entre les deux boutons sans sortir de la fenêtre.
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Abandonner' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Abandonner' })).toBeFocused()

    // Clic sur le fond : annule ; la question suivante prend la place.
    await page.mouse.click(5, 5)
    await expect(page.getByRole('dialog', { name: DISCARD })).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Annuler' })).toBeFocused()
    // Entrée : le bouton par défaut (Annuler).
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await names(page)).toEqual(['Toujours là'])
    expect(await nativeCalls()).toEqual([])
  } finally {
    await app.close()
  }
})

test('question venue du principal : fichier récent introuvable', async () => {
  const { app, page } = await launch()
  try {
    await expect(page.getByTestId('canvas')).toBeVisible()
    const nativeCalls = await spyNative(app, page)
    const missing = join(tmpdir(), 'maquette-absent-e2e.maquette')
    // Comme un double-clic sur un .maquette avec l'app déjà ouverte (attend la fenêtre prête s'il le faut).
    await app.evaluate(({ app: electronApp }, path) => void electronApp.emit('second-instance', {}, ['maquette', path], process.cwd()), missing)
    const dialog = page.getByRole('dialog', { name: 'maquette-absent-e2e.maquette est introuvable.' })
    await expect(dialog).toContainText('Il est retiré des fichiers récents.')
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await nativeCalls()).toEqual([])
  } finally {
    await app.close()
  }
})
