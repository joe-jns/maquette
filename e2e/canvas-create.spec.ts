import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'
import { pageChildren, scene, screenOf, settled, uiState, resetCamera } from './canvas'

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

test('R + glisser dessine un rectangle à cet endroit, puis retour à l’outil Déplacer', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  await page.keyboard.press('r')
  expect((await uiState(page)).tool).toBe('rect')
  const a = await screenOf(page, 100, 300)
  const b = await screenOf(page, 180, 360)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
  const created = (await pageChildren(page)).at(-1)!
  expect(created).toMatchObject({ type: 'shape', shape: 'rectangle', x: 100, y: 300, width: 80, height: 60 })
  const ui = await uiState(page)
  expect(ui.tool).toBe('move')
  expect(ui.selection).toEqual([created.id])
  await page.keyboard.press('Control+z')
  expect((await pageChildren(page)).map((n) => n.id)).not.toContain(created.id)
  await app.close()
})

test('F + clic : cadre 400 × 300 ; O + glisser avec Maj : cercle', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  await page.keyboard.press('f')
  const p = await screenOf(page, 100, 600)
  await page.mouse.click(p.x, p.y)
  expect((await pageChildren(page)).at(-1)).toMatchObject({ type: 'frame', x: 100, y: 600, width: 400, height: 300 })
  await page.keyboard.press('o')
  const a = await screenOf(page, 600, 600)
  const b = await screenOf(page, 690, 640)
  await page.mouse.move(a.x, a.y)
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  expect((await pageChildren(page)).at(-1)).toMatchObject({ type: 'shape', shape: 'ellipse', width: 90, height: 90 })
  await app.close()
})

test('créer dans un cadre automatique : l’élément y entre en flux', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'tSuite')
  await resetCamera(page)
  await page.keyboard.press('r')
  const box = (await page.locator('[data-node-id="tSuite"]').boundingBox())!
  await page.mouse.click(box.x + 5, box.y + box.height - 2)
  const hero = (await page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { children: { id: string; children?: { id: string; x?: number }[] }[] }[] } } } }).__maquetteStore.getState().doc.pages[0]!.children[0]!))
  expect(hero.children).toHaveLength(4)
  expect(hero.children!.some((c) => c.x !== undefined)).toBe(false)
  await app.close()
})

test('T + clic crée un texte et l’ouvre en édition', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  await page.keyboard.press('t')
  const p = await screenOf(page, 100, 420)
  await page.mouse.click(p.x, p.y)
  const created = (await pageChildren(page)).at(-1)!
  expect(created).toMatchObject({ type: 'text', content: 'Text' })
  expect((await uiState(page)).editing).toBe(created.id)
  await app.close()
})

test('déposer une image : copiée dans assets/ et affichée à sa taille', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dépôt image '))
  const file = join(dir, 'scène.maquette')
  await copyFile(scene, file)
  const { app, page } = await launch([file])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  const p = await screenOf(page, 120, 320)
  await page.evaluate(({ b64, x, y }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'point.png', { type: 'image/png' }))
    const target = document.querySelector('[data-testid="canvas"]')!
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }))
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }))
  }, { b64: PNG_1x1, x: p.x, y: p.y })
  await expect.poll(async () => (await pageChildren(page)).at(-1)!.type).toBe('image')
  const img = (await pageChildren(page)).at(-1)!
  // Centrée sur le point de dépôt : à un pixel près selon l'arrondi de la caméra.
  expect(img).toMatchObject({ width: 1, height: 1, y: 320 })
  expect(Math.abs(Number(img.x) - 120)).toBeLessThanOrEqual(1)
  expect(String(img.src)).toMatch(/^assets\/[0-9a-f]{16}\.png$/)
  expect(await readdir(join(dir, 'assets'))).toHaveLength(1)
  await expect.poll(() => page.locator(`img[data-node-id="${img.id}"]`).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1)
  await app.close()
})

test('la barre d’outils change l’outil au clic', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  await page.locator('[data-tool-button="text"]').click()
  expect((await uiState(page)).tool).toBe('text')
  // L'ellipse est dans le groupe des formes : chevron, puis choix dans la liste.
  await page.getByRole('button', { name: 'Shapes' }).click()
  await page.getByRole('menuitemradio', { name: 'Ellipse' }).click()
  expect((await uiState(page)).tool).toBe('ellipse')
  await expect(page.locator('[data-tool-button="ellipse"]')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  expect((await uiState(page)).tool).toBe('move')
  await app.close()
})
