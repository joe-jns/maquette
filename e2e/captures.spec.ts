import { test } from '@playwright/test'
import { join } from 'node:path'
import { launch } from './launch'
import { boxOf, centerOf, clickOn, handleCenter, scene, settled } from './canvas'

/** Captures des états clés du canevas, pour montrer le résultat. Lancer avec CAPTURES=1. */
test.skip(!process.env.CAPTURES, 'captures seulement sur demande (CAPTURES=1)')

const out = (name: string) => join(__dirname, '..', 'docs', 'captures', 'plan-2', name)

test('captures du plan 2', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.keyboard.press('Control+0')
  await page.waitForTimeout(200)
  await page.screenshot({ path: out('1-scene.png') })

  await clickOn(page, 'rBleu1')
  await page.screenshot({ path: out('2-selection-poignees.png') })

  const b = await centerOf(page, 'rBleu1')
  await page.mouse.move(b.x, b.y)
  await page.mouse.down()
  await page.mouse.move(b.x + 57, b.y + 1, { steps: 8 })
  await page.screenshot({ path: out('3-magnetisme-guides.png') })
  await page.mouse.up()
  await page.keyboard.press('Control+z')

  const suite = await boxOf(page, 'tSuite')
  const b2 = await centerOf(page, 'rBleu1')
  await page.mouse.move(b2.x, b2.y)
  await page.mouse.down()
  await page.mouse.move(suite.x + 30, suite.y + suite.height + 4, { steps: 12 })
  await page.screenshot({ path: out('4-insertion-cadre-auto.png') })
  await page.keyboard.press('Escape')
  await page.mouse.up()

  const t = await centerOf(page, 'tTitre')
  await page.mouse.dblclick(t.x, t.y)
  await page.waitForTimeout(350)
  await page.keyboard.down('Alt')
  const v = await centerOf(page, 'rVert1')
  await page.mouse.move(v.x, v.y)
  await page.waitForTimeout(100)
  await page.screenshot({ path: out('5-distances-alt.png') })
  await page.keyboard.up('Alt')

  await page.mouse.dblclick(t.x, t.y)
  await page.keyboard.type('Mon titre modifié')
  await page.screenshot({ path: out('6-edition-texte.png') })
  await page.keyboard.press('Escape')

  await clickOn(page, 'rBleu1')
  await page.keyboard.press('Control+0')
  const e = await handleCenter(page, 'se')
  await page.mouse.move(e.x, e.y)
  await page.mouse.down()
  await page.mouse.move(e.x + 60, e.y + 30, { steps: 6 })
  await page.screenshot({ path: out('7-redimensionnement.png') })
  await page.mouse.up()

  await page.keyboard.press('Shift+?')
  await page.waitForTimeout(150)
  await page.screenshot({ path: out('8-aide-raccourcis.png') })
  await app.close()
})
