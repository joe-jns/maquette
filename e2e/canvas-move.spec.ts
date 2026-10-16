import { test, expect } from '@playwright/test'
import { launch } from './launch'
import { canUndo, centerOf, clickOn, docNode, dragBy, scene, settled } from './canvas'

test.beforeEach(async ({}, info) => { info.setTimeout(30_000) })

test('glisser un élément le déplace ; Ctrl+Z l’annule en une fois', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.keyboard.press('Control+0')
  await dragBy(page, 'rBleu1', 50, 30, { hold: 'Control' })
  expect(await docNode(page, 'rBleu1')).toMatchObject({ x: 750, y: 70 })
  await page.keyboard.press('Control+z')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ x: 700, y: 40 })
  expect(await canUndo(page)).toBe(false)
  await app.close()
})

test('magnétisme : un bord à 3 px d’un voisin s’y colle, sauf avec Ctrl', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.keyboard.press('Control+0')
  await dragBy(page, 'rBleu1', 57, 0)
  expect(await docNode(page, 'rBleu1')).toMatchObject({ x: 760, y: 40 })
  await page.keyboard.press('Control+z')
  await dragBy(page, 'rBleu1', 57, 0, { hold: 'Control' })
  expect(await docNode(page, 'rBleu1')).toMatchObject({ x: 757, y: 40 })
  await app.close()
})

test('les guides apparaissent pendant le glisser et disparaissent après', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.keyboard.press('Control+0')
  await dragBy(page, 'rBleu1', 57, 0, { release: false })
  await expect(page.locator('[data-guide]')).not.toHaveCount(0)
  await page.mouse.up()
  await expect(page.locator('[data-guide]')).toHaveCount(0)
  await app.close()
})

test('Échap pendant le glisser remet en place sans historique', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await dragBy(page, 'rBleu1', 80, 80, { release: false })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await docNode(page, 'rBleu1')).toMatchObject({ x: 700, y: 40 })
  expect(await canUndo(page)).toBe(false)
  await app.close()
})

test('un enfant d’un cadre libre se déplace dans son parent', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rDedan')
  await page.keyboard.press('Control+0')
  const c = await centerOf(page, 'rDedan')
  await page.mouse.dblclick(c.x, c.y)
  await page.waitForTimeout(350)
  await dragBy(page, 'rDedan', 30, 40, { hold: 'Control' })
  expect(await docNode(page, 'rDedan')).toMatchObject({ x: 50, y: 60 })
  await app.close()
})

test('flèches : 1 px, Maj+flèche : 10 px', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ x: 701, y: 50 })
  await app.close()
})
