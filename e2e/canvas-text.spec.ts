import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { centerOf, docNode, pageChildren, scene, settled, uiState } from './canvas'

async function editTitre(page: Page) {
  const c = await centerOf(page, 'tTitre')
  await page.mouse.dblclick(c.x, c.y)
  await page.waitForTimeout(350)
  await page.mouse.dblclick(c.x, c.y)
  await expect.poll(async () => (await uiState(page)).editing).toBe('tTitre')
}

test('double-clic sur un texte : on tape, Échap valide, une seule annulation', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'tTitre')
  await editTitre(page)
  await page.keyboard.type('Nouveau titre')
  await page.keyboard.press('Escape')
  expect(await docNode(page, 'tTitre')).toMatchObject({ content: 'Nouveau titre' })
  expect((await uiState(page)).editing).toBeNull()
  await page.keyboard.press('Control+z')
  expect(await docNode(page, 'tTitre')).toMatchObject({ content: 'Bonjour Maquette' })
  await app.close()
})

test('pendant l’édition, les touches vont au texte, pas aux raccourcis', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'tTitre')
  await editTitre(page)
  await page.keyboard.press('End')
  await page.keyboard.type(' r')
  await page.keyboard.press('Delete')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
  expect(await docNode(page, 'tTitre')).toMatchObject({ content: 'Bonjour Maquette ' })
  expect((await uiState(page)).tool).toBe('move')
  expect((await pageChildren(page)).length).toBe(4)
  await app.close()
})

test('Entrée fait un retour à la ligne ; cliquer ailleurs valide', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'tTitre')
  await editTitre(page)
  await page.keyboard.type('Ligne 1')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Ligne 2')
  await page.mouse.click(5, 300)
  expect(await docNode(page, 'tTitre')).toMatchObject({ content: 'Ligne 1\nLigne 2' })
  await app.close()
})

test('vider le texte supprime l’élément', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'tTitre')
  await editTitre(page)
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
  expect(await docNode(page, 'tTitre')).toBeNull()
  await page.keyboard.press('Control+z')
  expect(await docNode(page, 'tTitre')).toMatchObject({ content: 'Bonjour Maquette' })
  await app.close()
})
