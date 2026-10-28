import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { resetCamera, scene, settled, uiState } from './canvas'

const select = (page: Page, ids: string[]) =>
  page.evaluate((s) => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select(s), ids)
const row = (page: Page, id: string) => page.locator(`[data-layer-id="${id}"]`)
/** Couleur de la surbrillance d'une ligne (pseudo-élément ::before). */
const highlight = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => getComputedStyle(el, '::before').backgroundColor)

test('formes : le chevron ouvre la liste, la forme choisie remplace l’icône du groupe', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  const chevron = page.getByRole('button', { name: 'Shapes' })
  await chevron.click()
  const menu = page.getByRole('menu', { name: 'Shapes' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitemradio', { name: /Rectangle/ })).toHaveAttribute('aria-checked', 'true')
  await expect(menu.getByRole('menuitemradio', { name: /Ellipse/ })).toContainText('O')
  // La liste s'ouvre au-dessus de la barre (barre du bas).
  const m = (await menu.boundingBox())!
  const bar = (await page.getByRole('toolbar', { name: 'Tools' }).boundingBox())!
  expect(m.y + m.height).toBeLessThanOrEqual(bar.y)
  await menu.getByRole('menuitemradio', { name: /Ellipse/ }).click()
  await expect(menu).toBeHidden()
  expect((await uiState(page)).tool).toBe('ellipse')
  await expect(page.locator('[data-tool-button="ellipse"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-tool-button="rect"]')).toHaveCount(0)
  // Un clic ailleurs ferme sans rien changer.
  await chevron.click()
  await expect(menu).toBeVisible()
  await page.getByTestId('left-panel').click({ position: { x: 120, y: 600 } })
  await expect(menu).toBeHidden()
  // R au clavier remet le rectangle dans le groupe.
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Escape')
  await page.keyboard.press('r')
  await expect(page.locator('[data-tool-button="rect"]')).toHaveAttribute('aria-pressed', 'true')
  await app.close()
})

test('formes au clavier : Entrée ouvre, flèches, Entrée choisit, Échap ferme sans toucher à la sélection', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await select(page, ['rBleu1'])
  const chevron = page.getByRole('button', { name: 'Shapes' })
  await chevron.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu', { name: 'Shapes' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitemradio', { name: /Rectangle/ })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitemradio', { name: /Ellipse/ })).toBeFocused()
  // Les flèches restent dans le menu : rien n'a bougé sur le canevas.
  expect((await uiState(page)).selection).toEqual(['rBleu1'])
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  expect((await uiState(page)).tool).toBe('ellipse')
  await expect(chevron).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitemradio', { name: /Ellipse/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(chevron).toBeFocused()
  const ui = await uiState(page)
  expect(ui.tool).toBe('ellipse')
  expect(ui.selection).toEqual(['rBleu1'])
  await app.close()
})

test('calques : enfants de la sélection teintés en un bloc ; page courante en gris, pas en bleu', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  // Sélectionner un enfant déplie le cadre ; puis le cadre lui-même.
  await select(page, ['tSuite'])
  await expect(row(page, 'tSuite')).toBeVisible()
  await select(page, ['fHero1'])
  await expect(row(page, 'fHero1')).toHaveAttribute('data-tint', 'sel-open')
  await expect(row(page, 'tTitre')).toHaveAttribute('data-tint', 'in')
  await expect(row(page, 'tSuite')).toHaveAttribute('data-tint', 'in')
  await expect(row(page, 'tTroisi')).toHaveAttribute('data-tint', 'in-last')
  await expect(row(page, 'rBleu1')).not.toHaveAttribute('data-tint')
  await page.mouse.move(1000, 10)
  expect(await highlight(page, '[data-layer-id="fHero1"]')).toBe('rgb(229, 244, 255)')
  expect(await highlight(page, '[data-layer-id="tTitre"]')).toBe('rgb(242, 249, 255)')
  // Le bloc est continu : la teinte du premier enfant touche la surbrillance du cadre.
  const parent = (await row(page, 'fHero1').boundingBox())!
  const child = (await row(page, 'tTitre').boundingBox())!
  expect(child.y).toBe(parent.y + parent.height)
  // Nom de la sélection en texte fort.
  const weight = await row(page, 'fHero1').locator('.layer-name').evaluate((el) => getComputedStyle(el).fontWeight)
  expect(Number(weight)).toBeGreaterThan(500)
  // Plus de sélection : plus de teinte.
  await select(page, [])
  await expect(page.locator('[data-tint]')).toHaveCount(0)

  const current = page.locator('[data-testid="pages"] li[aria-current="page"]')
  await expect(current).toHaveCount(1)
  expect(await highlight(page, '[data-testid="pages"] li[aria-current="page"]')).toBe('rgb(245, 245, 245)')
  expect(Number(await current.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThan(500)
  await app.close()
})

test('en-tête du fichier : nom sans extension, point « modifié » après un changement', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await expect(page.getByTestId('file-header')).toContainText('scene')
  await expect(page.getByTestId('file-header')).not.toContainText('.maquette')
  await expect(page.getByTestId('file-dirty')).toHaveCount(0)
  await row(page, 'rBleu1').hover()
  await row(page, 'rBleu1').getByRole('button', { name: 'Hide' }).click()
  await expect(page.getByTestId('file-dirty')).toHaveCount(1)
  await page.getByTestId('file-header').getByRole('button').click()
  const menu = page.getByRole('menu', { name: 'File' })
  await expect(menu.getByRole('menuitem', { name: /Save as/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await app.close()
})

test('zoom : − et + au pas, menu du pourcentage', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  const value = page.getByTestId('zoom')
  // Repartir de 100 %.
  await value.click()
  await page.getByRole('menuitem', { name: /Zoom to 100%/ }).click()
  await expect(value).toHaveText('100%')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(async () => parseInt((await value.textContent())!)).toBeGreaterThan(100)
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect(value).toHaveText('100%')
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect.poll(async () => parseInt((await value.textContent())!)).toBeLessThan(100)

  await value.click()
  const menu = page.getByRole('menu', { name: 'Zoom' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /Zoom to selection/ })).toBeDisabled()
  await menu.getByRole('menuitem', { name: /Zoom to 200%/ }).click()
  await expect(value).toHaveText('200%')
  await value.click()
  await menu.getByRole('menuitem', { name: /Zoom to 50%/ }).click()
  await expect(value).toHaveText('50%')
  await value.click()
  await menu.getByRole('menuitem', { name: /Zoom to fit/ }).click()
  await expect.poll(async () => (await value.textContent())!).not.toBe('50%')
  await select(page, ['rBleu1'])
  await value.click()
  await expect(menu.getByRole('menuitem', { name: /Zoom to selection/ })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await app.close()
})
