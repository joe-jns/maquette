import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { centerOf, clickOn, docNode, scene, settled, uiState } from './canvas'

const row = (page: Page, id: string) => page.locator(`[data-layer-id="${id}"]`)
const rowIds = (page: Page) => page.locator('[data-layer-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.layerId))

test('ordre de Figma ; sélection synchronisée dans les deux sens ; dépliage automatique', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  expect(await rowIds(page)).toEqual(['fLibre', 'rVert1', 'rBleu1', 'fHero1'])
  await row(page, 'rVert1').click()
  expect((await uiState(page)).selection).toEqual(['rVert1'])
  await clickOn(page, 'rBleu1')
  await expect(row(page, 'rBleu1')).toHaveAttribute('aria-selected', 'true')
  const c = await centerOf(page, 'tSuite')
  await page.mouse.dblclick(c.x, c.y)
  await expect(row(page, 'tSuite')).toHaveAttribute('aria-selected', 'true')
  expect(await rowIds(page)).toEqual(['fLibre', 'rVert1', 'rBleu1', 'fHero1', 'tTitre', 'tSuite', 'tTroisi'])
  await app.close()
})

test('renommer un calque ; un nom vide garde l’ancien', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await row(page, 'rBleu1').dblclick()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Carré bleu')
  await page.keyboard.press('Enter')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ name: 'Carré bleu' })
  await row(page, 'rBleu1').dblclick()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Enter')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ name: 'Carré bleu' })
  await app.close()
})

test('masquer et verrouiller depuis la ligne', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await row(page, 'rBleu1').hover()
  await row(page, 'rBleu1').getByRole('button', { name: 'Masquer' }).click()
  expect(await docNode(page, 'rBleu1')).toMatchObject({ visible: false })
  await expect(page.locator('[data-node-id="rBleu1"]')).toBeHidden()
  await row(page, 'rBleu1').getByRole('button', { name: 'Afficher' }).click()
  await row(page, 'rVert1').hover()
  await row(page, 'rVert1').getByRole('button', { name: 'Verrouiller' }).click()
  expect(await docNode(page, 'rVert1')).toMatchObject({ locked: true })
  await app.close()
})

test('glisser un calque au milieu d’un cadre le range dedans', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  const target = (await row(page, 'fHero1').boundingBox())!
  await row(page, 'rBleu1').dragTo(row(page, 'fHero1'), { targetPosition: { x: 40, y: target.height / 2 } })
  const hero = (await docNode(page, 'fHero1')) as unknown as { children: { id: string }[] }
  expect(hero.children.map((c) => c.id)).toEqual(['tTitre', 'tSuite', 'tTroisi', 'rBleu1'])
  await app.close()
})
