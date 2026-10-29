import { test, expect, type Page } from '@playwright/test'
import { copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'
import { centerOf, docNode, node, selection, settled, uiState } from './canvas'

const fixture = join(__dirname, 'fixtures', 'composants.maquette')

/** Copie de la fixture : l'enregistrement automatique ne doit jamais toucher l'original. */
async function open() {
  const file = join(await mkdtemp(join(tmpdir(), 'maquette-composants-')), 'composants.maquette')
  await copyFile(fixture, file)
  const opened = await launch([file])
  await settled(opened.page, 'fCarte')
  return opened
}

type Layer = { id: string; content?: string; source?: string; overrides?: string[]; instanceOf?: string; component?: boolean; width?: unknown; children?: Layer[] }

const layer = async (page: Page, id: string) => (await docNode(page, id)) as Layer | null

async function dispatch(page: Page, ops: unknown[]) {
  await page.evaluate((list) => {
    const store = (window as unknown as { __maquetteStore: { getState(): { dispatch(ops: unknown[], label: string): { ok: boolean } } } }).__maquetteStore
    if (!store.getState().dispatch(list, 'test').ok) throw new Error('lot refusé')
  }, ops)
}

/** Double-clic qui entre dans les cadres jusqu'au texte, puis l'édite (tout le texte sélectionné). */
async function editText(page: Page, id: string, value: string) {
  const c = await centerOf(page, id)
  await page.mouse.dblclick(c.x, c.y)
  await page.waitForTimeout(350)
  await page.mouse.dblclick(c.x, c.y)
  await expect.poll(async () => (await uiState(page)).editing).toBe(id)
  await page.keyboard.type(value)
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await layer(page, id))?.content).toBe(value)
}

test('créer un composant : clic droit « Create component », puis Ctrl+Alt+K ; violet dans les calques et sur la toile', async () => {
  const { app, page } = await open()
  const c = await centerOf(page, 'fCarte')
  await page.mouse.click(c.x, c.y)
  expect(await selection(page)).toEqual(['fCarte'])
  await page.mouse.click(c.x, c.y, { button: 'right' })
  const menu = page.getByRole('menu', { name: 'Canvas' })
  await expect(menu.getByRole('menuitem', { name: 'Create component' }).locator('.menu-shortcut')).toHaveText('Ctrl+Alt+K')
  await menu.getByRole('menuitem', { name: 'Create component' }).click()
  await expect.poll(async () => (await layer(page, 'fCarte'))?.component).toBe(true)

  // Losanges dans les calques, nom violet sur la toile, contour de sélection violet.
  await expect(page.locator('[data-layer-id="fCarte"] [data-icon="component"]')).toBeVisible()
  await expect(page.locator('[data-layer-id="fCarte"]')).toHaveClass(/is-component/)
  await expect(page.getByTestId('component-label')).toHaveCount(1)
  await expect(page.getByTestId('component-label')).toContainText('Carte')
  await expect(page.getByTestId('selection-box')).toHaveAttribute('stroke', '#9747FF')
  await expect(page.getByTestId('right-panel').getByTestId('component-info')).toHaveText('No instances yet')

  // Ctrl+Alt+K sur un autre cadre, puis une annulation.
  const other = await centerOf(page, 'fAutre')
  await page.mouse.click(other.x, other.y)
  await page.keyboard.press('Control+Alt+k')
  await expect.poll(async () => (await layer(page, 'fAutre'))?.component).toBe(true)
  await expect(page.getByTestId('component-label')).toHaveCount(2)
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await layer(page, 'fAutre'))?.component).toBeUndefined()
  await app.close()
})

test('Components : poser une instance ; le principal la met à jour, une surcharge de texte survit ; rétablir ; détacher', async () => {
  const { app, page } = await open()
  await dispatch(page, [{ op: 'update', id: 'fCarte', set: { component: true } }])

  // La fenêtre Components liste le principal ; un clic pose une instance au centre de la vue.
  await page.locator('[data-floating-button="components"]').click()
  const modal = page.getByTestId('floating-components')
  await expect(modal).toBeVisible()
  await expect(modal.getByTestId('component-card')).toHaveCount(1)
  await expect(modal.getByTestId('component-card')).toContainText('Carte')
  await modal.getByTestId('component-card').click()
  await expect(modal).toBeHidden()
  const [inst] = await selection(page)
  expect(inst).toBeTruthy()
  const created = (await layer(page, inst!))!
  expect(created.instanceOf).toBe('fCarte')
  expect(created.children!.map((n) => n.source)).toEqual(['tCarte', 'rPuce'])
  await expect(page.locator('[data-layer-id="' + inst + '"] [data-icon="instance"]')).toBeVisible()
  await expect(page.getByTestId('right-panel').getByTestId('component-info')).toHaveText('Instance of Carte')
  const copyText = created.children![0]!.id
  await expect(page.locator(node(copyText))).toHaveText('Titre de carte')

  // Modifier le texte du principal met l'instance à jour.
  await editText(page, 'tCarte', 'Nouveau titre')
  await expect(page.locator(node(copyText))).toHaveText('Nouveau titre')

  // Le texte modifié dans l'instance devient une surcharge, qui survit au principal ; le reste suit.
  await editText(page, copyText, 'Texte local')
  expect((await layer(page, copyText))!.overrides).toEqual(['content'])
  await editText(page, 'tCarte', 'Encore changé')
  await expect(page.locator(node(copyText))).toHaveText('Texte local')
  await dispatch(page, [{ op: 'update', id: 'rPuce', set: { width: 80 } }])
  expect((await layer(page, inst!))!.children![1]!.width).toBe(80)

  // Supprimer un calque de l'instance est refusé, avec un message.
  await page.locator(`[data-layer-id="${copyText}"]`).click()
  await page.keyboard.press('Delete')
  await expect(page.getByRole('alert')).toContainText('inside an instance')
  expect(await layer(page, copyText)).not.toBeNull()

  // Rétablir : le texte revient à celui du principal.
  await page.locator(`[data-layer-id="${inst}"]`).click()
  await page.getByTestId('right-panel').getByRole('button', { name: 'Reset changes' }).click()
  await expect(page.locator(node(copyText))).toHaveText('Encore changé')
  expect((await layer(page, copyText))!.overrides).toBeUndefined()

  // Détacher : des calques ordinaires, qui ne suivent plus le principal.
  await page.getByTestId('right-panel').getByRole('button', { name: 'Detach' }).click()
  const detached = (await layer(page, inst!))!
  expect(detached.instanceOf).toBeUndefined()
  expect(detached.children!.every((n) => n.source === undefined)).toBe(true)
  await dispatch(page, [{ op: 'update', id: 'tCarte', set: { content: 'Après détachement' } }])
  await expect(page.locator(node(copyText))).toHaveText('Encore changé')
  await app.close()
})
