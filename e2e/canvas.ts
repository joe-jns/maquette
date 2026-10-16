import { expect, type Page } from '@playwright/test'
import { join } from 'node:path'

/** Outils partagés des tests du canevas. */
export const scene = join(__dirname, 'fixtures', 'scene.maquette')

export const node = (id: string) => `[data-node-id="${id}"]`

export async function centerOf(page: Page, id: string) {
  const b = (await page.locator(node(id)).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

export async function boxOf(page: Page, id: string) {
  return (await page.locator(node(id)).boundingBox())!
}

/** Attend que le cadrage du chargement soit appliqué (même position deux fois de suite). */
export async function settled(page: Page, id: string) {
  await expect(page.locator(node(id))).toBeVisible()
  let last = ''
  await expect.poll(async () => {
    const now = JSON.stringify(await boxOf(page, id))
    const same = now === last
    last = now
    return same
  }, { intervals: [50] }).toBe(true)
}

export const selection = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteUi: { getState(): { selection: string[] } } }).__maquetteUi.getState().selection)

export async function clickOn(page: Page, id: string, modifiers: ('Shift' | 'Control' | 'Alt')[] = []) {
  const c = await centerOf(page, id)
  for (const m of modifiers) await page.keyboard.down(m)
  await page.mouse.click(c.x, c.y)
  for (const m of modifiers) await page.keyboard.up(m)
}
