import { test, expect, type Page } from '@playwright/test'
import { join } from 'node:path'
import { launch } from './launch'

const demo = join(__dirname, 'fixtures', 'demo.maquette')
const centerOf = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** Attend que le cadrage du chargement soit appliqué : même position sur deux images d'affilée. */
async function settled(page: Page, sel: string) {
  await expect(page.locator(sel)).toBeVisible()
  let last = ''
  await expect.poll(async () => {
    const now = JSON.stringify(await centerOf(page, sel))
    const same = now === last
    last = now
    return same
  }, { intervals: [50] }).toBe(true)
}

test('Ctrl+molette zoome vers le curseur, sans zoomer la fenêtre Electron', async () => {
  const { app, page } = await launch([demo])
  const titre = '[data-node-id="tTitre"]'
  await settled(page, titre)
  const before = await centerOf(page, titre)
  const badge = await page.getByTestId('zoom').textContent()
  await page.mouse.move(before.x, before.y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -200)
  await page.keyboard.up('Control')
  await expect(page.getByTestId('zoom')).not.toHaveText(badge!)
  const after = await centerOf(page, titre)
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2)
  const factor = await app.evaluate(({ webContents }) => webContents.getAllWebContents()[0]!.getZoomFactor())
  expect(factor).toBe(1)
  await app.close()
})

test('la molette seule déplace la vue sans zoomer', async () => {
  const { app, page } = await launch([demo])
  const titre = '[data-node-id="tTitre"]'
  await settled(page, titre)
  const badge = await page.getByTestId('zoom').textContent()
  const before = await centerOf(page, titre)
  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, 40)
  await expect.poll(async () => (await centerOf(page, titre)).y).toBeCloseTo(before.y - 60, 0)
  await expect(page.getByTestId('zoom')).toHaveText(badge!)
  await app.close()
})

test('Espace + glisser déplace la vue', async () => {
  const { app, page } = await launch([demo])
  const titre = '[data-node-id="tTitre"]'
  await settled(page, titre)
  const before = await centerOf(page, titre)
  await page.mouse.move(900, 600)
  await page.keyboard.down(' ')
  await page.mouse.down()
  await page.mouse.move(1000, 650, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.up(' ')
  const after = await centerOf(page, titre)
  expect(Math.round(after.x - before.x)).toBe(100)
  expect(Math.round(after.y - before.y)).toBe(50)
  await app.close()
})

test('Ctrl+0 revient à 100 %, Maj+1 recadre tout', async () => {
  const { app, page } = await launch([demo])
  await settled(page, '[data-node-id="tTitre"]')
  await page.mouse.move(400, 300)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -300)
  await page.keyboard.up('Control')
  await expect(page.getByTestId('zoom')).not.toHaveText('100%')
  await page.keyboard.press('Control+0')
  await expect(page.getByTestId('zoom')).toHaveText('100%')
  await page.mouse.wheel(0, 2000)
  await page.keyboard.press('Shift+!')
  await expect.poll(async () => {
    const b = await page.locator('[data-node-id="fHero1"]').boundingBox()
    return b !== null && b.y > 0 && b.y < 900
  }).toBe(true)
  await app.close()
})
