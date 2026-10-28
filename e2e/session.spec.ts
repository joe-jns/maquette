import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
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

/** Demande la fermeture de la fenêtre de l'éditeur (comme la croix). */
const closeWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())?.close())

/** La question posée dans la fenêtre : on vérifie son texte, puis on clique sur un de ses boutons. */
async function answerDialog(page: Page, message: string, button: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: message })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: button, exact: true }).click()
}

test('copie de secours : l’app plante, au lancement suivant le travail est restauré', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'maquette-session-'))
  const first = await launch([], { MAQUETTE_USER_DATA: userData })
  await expect(first.page.getByTestId('canvas')).toBeVisible()
  await addRect(first.page, 'Travail perdu ?')
  await first.page.waitForTimeout(6000)
  // Plantage : processus tué. On attend sa fin, sinon le verrou « une seule Maquette » est encore tenu.
  // Tout l'arbre (les processus enfants d'Electron gardent sinon le dossier de données verrouillé).
  const dead = new Promise((resolve) => first.app.process().once('exit', resolve))
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(first.app.process().pid), '/T', '/F'], { stdio: 'ignore' })
  else first.app.process().kill('SIGKILL')
  await dead
  await new Promise((resolve) => setTimeout(resolve, 500))

  const second = await launch([], { MAQUETTE_USER_DATA: userData })
  try {
    const banner = second.page.getByTestId('recovery')
    await expect(banner).toContainText('Untitled')
    await banner.getByRole('button', { name: 'Restore' }).click()
    await expect(banner).toHaveCount(0)
    expect(await names(second.page)).toContain('Travail perdu ?')
    await expect(second.page).toHaveTitle(/•/)
  } finally {
    await second.app.close()
  }

  // Restaurée mais jamais enregistrée : elle est recopiée tout de suite, donc reproposée au lancement suivant.
  const third = await launch([], { MAQUETTE_USER_DATA: userData })
  try {
    await expect(third.page.getByTestId('recovery')).toContainText('Untitled')
    await third.page.getByTestId('recovery').getByRole('button', { name: 'Dismiss' }).click()
    await expect(third.page.getByTestId('recovery')).toHaveCount(0)
  } finally {
    await third.app.close()
  }

  // Ignorée : plus rien à proposer.
  const fourth = await launch([], { MAQUETTE_USER_DATA: userData })
  try {
    await expect(fourth.page.getByTestId('canvas')).toBeVisible()
    await fourth.page.waitForTimeout(500)
    await expect(fourth.page.getByTestId('recovery')).toHaveCount(0)
  } finally {
    await fourth.app.close()
  }
})

test('fermeture avec changements : question ; Annuler garde la fenêtre, Ne pas enregistrer ferme', async () => {
  const { app, page } = await launch([], { MAQUETTE_E2E_GUARD: '1' })
  await expect(page.getByTestId('canvas')).toBeVisible()
  await addRect(page, 'Modifié')
  await expect(page).toHaveTitle(/•/)

  await closeWindow(app)
  await answerDialog(page, 'Save changes to Untitled?', 'Cancel')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.waitForTimeout(300)
  expect(page.isClosed()).toBe(false)

  await closeWindow(app)
  const closed = app.waitForEvent('close')
  await answerDialog(page, 'Save changes to Untitled?', 'Don’t save')
  await closed
})

test('fermeture pendant la saisie d’un texte : la question est posée', async () => {
  const { app, page } = await launch([join(__dirname, 'fixtures', 'scene.maquette')], { MAQUETTE_E2E_GUARD: '1' })
  await expect(page.locator('[data-node-id="tTitre"]')).toBeVisible()
  // Comme l'utilisateur : double-clic dans le texte, puis frappe (le texte n'est pas encore validé).
  await page.locator('[data-node-id="tTitre"]').dblclick()
  await page.locator('[data-node-id="tTitre"]').dblclick()
  await page.keyboard.type(' !')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __maquetteUi: { getState(): { editingTextId: string | null } } }).__maquetteUi.getState().editingTextId)).toBe('tTitre')
  await closeWindow(app)
  await answerDialog(page, 'Save changes to scene.maquette?', 'Cancel')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await closeWindow(app)
  const closed = app.waitForEvent('close')
  await answerDialog(page, 'Save changes to scene.maquette?', 'Don’t save')
  await closed
})
