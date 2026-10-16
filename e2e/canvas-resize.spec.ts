import { test, expect } from '@playwright/test'
import { launch } from './launch'
import { centerOf, clickOn, docNode, dragHandle, handleCenter, scene, settled } from './canvas'

test('poignée droite : largeur +40, hauteur et position inchangées, une annulation', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.keyboard.press('Control+0')
  await clickOn(page, 'rBleu1')
  await dragHandle(page, 'e', 40, 0, 'Control')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ x: 700, y: 40, width: 140, height: 100 })
  await page.keyboard.press('Control+z')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ width: 100 })
  await app.close()
})

test('poignée gauche : le bord gauche bouge, le droit reste', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.keyboard.press('Control+0')
  await clickOn(page, 'rBleu1')
  await dragHandle(page, 'w', -30, 0, 'Control')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ x: 670, width: 130 })
  await app.close()
})

test('coin avec Maj : proportions gardées', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.keyboard.press('Control+0')
  await clickOn(page, 'rBleu1')
  await dragHandle(page, 'se', 50, 10, 'Shift')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ width: 150, height: 150 })
  await app.close()
})

test('double-clic sur le bord bas : la hauteur suit le contenu', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'fHero1')
  await page.keyboard.press('Control+0')
  await clickOn(page, 'fHero1')
  await dragHandle(page, 's', 0, 40, 'Control')
  expect(typeof (await docNode(page, 'fHero1'))!.height).toBe('number')
  const s = await handleCenter(page, 's')
  await page.mouse.dblclick(s.x, s.y)
  expect(await docNode(page, 'fHero1')).toMatchObject({ height: { mode: 'hug' } })
  await app.close()
})

test('Alt + double-clic sur le bord droit d’un enfant : il remplit la largeur', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'tTitre')
  const c = await centerOf(page, 'tTitre')
  await page.mouse.dblclick(c.x, c.y)
  const e = await handleCenter(page, 'e')
  await page.waitForTimeout(350)
  await page.keyboard.down('Alt')
  await page.mouse.dblclick(e.x, e.y)
  await page.keyboard.up('Alt')
  expect(await docNode(page, 'tTitre')).toMatchObject({ width: { mode: 'fill' } })
  await app.close()
})
