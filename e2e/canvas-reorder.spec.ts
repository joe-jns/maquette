import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { boxOf, centerOf, docNode, scene, settled } from './canvas'

const childIds = async (page: Page, id: string) => ((await docNode(page, id)) as { children: { id: string }[] }).children.map((c) => c.id)
const pageIds = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { children: { id: string }[] }[] } } } }).__maquetteStore.getState().doc.pages[0]!.children.map((c) => c.id))

async function enter(page: Page, id: string) {
  const c = await centerOf(page, id)
  await page.mouse.dblclick(c.x, c.y)
  await page.waitForTimeout(350)
}

test('réordonner en direct dans une colonne, annuler en une fois', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'tTitre')
  await page.keyboard.press('Control+0')
  await enter(page, 'tTitre')
  const from = await centerOf(page, 'tTitre')
  const suite = await boxOf(page, 'tSuite')
  const troisi = await boxOf(page, 'tTroisi')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, (suite.y + suite.height + troisi.y + troisi.height / 2) / 2 + 4, { steps: 10 })
  await expect.poll(() => childIds(page, 'fHero1')).toEqual(['tSuite', 'tTitre', 'tTroisi'])
  await page.mouse.up()
  expect(await childIds(page, 'fHero1')).toEqual(['tSuite', 'tTitre', 'tTroisi'])
  await page.keyboard.press('Control+z')
  expect(await childIds(page, 'fHero1')).toEqual(['tTitre', 'tSuite', 'tTroisi'])
  await app.close()
})

test('sortir un enfant d’un cadre automatique vers la page', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'tTitre')
  await page.keyboard.press('Control+0')
  await enter(page, 'tTitre')
  const from = await centerOf(page, 'tTitre')
  const hero = await boxOf(page, 'fHero1')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, hero.y + hero.height + 120, { steps: 10 })
  await page.mouse.up()
  expect(await childIds(page, 'fHero1')).toEqual(['tSuite', 'tTroisi'])
  expect(await pageIds(page)).toContain('tTitre')
  const n = (await docNode(page, 'tTitre'))!
  expect(typeof n.x).toBe('number')
  expect(typeof n.y).toBe('number')
  await app.close()
})

test('déposer un élément libre dans un cadre automatique : trait d’insertion puis dépôt', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.keyboard.press('Control+0')
  const from = await centerOf(page, 'rBleu1')
  const suite = await boxOf(page, 'tSuite')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(suite.x + 20, suite.y + suite.height + 4, { steps: 12 })
  await expect(page.getByTestId('insertion')).toHaveCount(1)
  await expect(page.getByTestId('ghost')).toHaveCount(1)
  await page.mouse.up()
  await expect(page.getByTestId('ghost')).toHaveCount(0)
  await expect(page.getByTestId('insertion')).toHaveCount(0)
  expect(await childIds(page, 'fHero1')).toEqual(['tTitre', 'tSuite', 'rBleu1', 'tTroisi'])
  await app.close()
})
