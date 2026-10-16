import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { clickOn, docNode, pageChildren, scene, screenOf, settled, uiState } from './canvas'

const ids = async (page: Page) => (await pageChildren(page)).map((n) => n.id as string)

test('Ctrl+D duplique et sélectionne la copie ; Suppr supprime', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await page.keyboard.press('Control+d')
  const after = await ids(page)
  expect(after).toHaveLength(5)
  const copy = (await uiState(page)).selection[0]!
  expect(copy).not.toBe('rBleu1')
  expect(await docNode(page, copy)).toMatchObject({ x: 710, y: 50 })
  await page.keyboard.press('Delete')
  expect(await ids(page)).toEqual(['fHero1', 'rBleu1', 'rVert1', 'fLibre'])
  await app.close()
})

test('Ctrl+Alt+G encadre deux éléments ; Maj+A passe le cadre en mise en page automatique', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await clickOn(page, 'rVert1', ['Shift'])
  await page.keyboard.press('Control+Alt+g')
  const frameId = (await uiState(page)).selection[0]!
  const frame = (await docNode(page, frameId)) as unknown as { children: { id: string }[]; layout: { mode: string } }
  expect(frame.children.map((c) => c.id)).toEqual(['rBleu1', 'rVert1'])
  await page.keyboard.press('Shift+A')
  expect(((await docNode(page, frameId)) as unknown as { layout: { mode: string; direction: string } }).layout).toMatchObject({ mode: 'auto', direction: 'row' })
  await app.close()
})

test('Ctrl+C puis Ctrl+V colle une copie là où se trouve le pointeur', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.keyboard.press('Control+0')
  await clickOn(page, 'rBleu1')
  await page.keyboard.press('Control+c')
  const p = await screenOf(page, 100, 420)
  await page.mouse.move(p.x, p.y)
  await page.keyboard.press('Control+v')
  const pasted = (await pageChildren(page)).at(-1)!
  expect(pasted).toMatchObject({ type: 'shape', x: 100, y: 420, width: 100 })
  expect((await uiState(page)).selection).toEqual([pasted.id])
  await app.close()
})

test('Ctrl+] et Ctrl+[ changent l’ordre d’empilement', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await page.keyboard.press('Control+BracketRight')
  expect(await ids(page)).toEqual(['fHero1', 'rVert1', 'rBleu1', 'fLibre'])
  await page.keyboard.press('Control+BracketLeft')
  expect(await ids(page)).toEqual(['fHero1', 'rBleu1', 'rVert1', 'fLibre'])
  await app.close()
})

test('? ouvre l’aide, Échap la ferme', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.keyboard.press('Shift+?')
  const help = page.getByRole('dialog', { name: 'Raccourcis clavier' })
  await expect(help).toBeVisible()
  await expect(help).toContainText('Ctrl+D')
  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
  await app.close()
})
