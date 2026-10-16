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

type DocNode = { id: string; x?: number; y?: number; width?: unknown; height?: unknown; children?: DocNode[] }

/** Lit un élément du document par son id (via le store exposé en e2e). */
export const docNode = (page: Page, id: string) =>
  page.evaluate((target) => {
    const store = (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { children: DocNode[] }[] } } } }).__maquetteStore
    const find = (list: DocNode[]): DocNode | null => {
      for (const n of list) {
        if (n.id === target) return n
        const inner = n.children ? find(n.children) : null
        if (inner) return inner
      }
      return null
    }
    for (const p of store.getState().doc.pages) {
      const n = find(p.children)
      if (n) return n
    }
    return null
  }, id)

export const canUndo = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { canUndo: boolean } } }).__maquetteStore.getState().canUndo)

/** Glisse depuis le centre d'un élément d'un décalage écran donné. */
export async function dragBy(page: Page, id: string, dx: number, dy: number, opts: { hold?: 'Control' | 'Shift'; release?: boolean } = {}) {
  const c = await centerOf(page, id)
  await page.mouse.move(c.x, c.y)
  if (opts.hold) await page.keyboard.down(opts.hold)
  await page.mouse.down()
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 8 })
  if (opts.release !== false) await page.mouse.up()
  if (opts.hold) await page.keyboard.up(opts.hold)
}
