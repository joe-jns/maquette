import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { clickOn, docNode, scene, settled } from './canvas'

const panel = (page: Page) => page.getByTestId('right-panel')
const styles = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: { styles: { colors: { id: string; name: string; value: string }[]; text: { name: string; fontSize: number }[] } } } } }).__maquetteStore.getState().doc.styles)

async function typeInto(page: Page, name: string, text: string) {
  const input = panel(page).getByRole('textbox', { name, exact: true })
  await input.click()
  await input.press('Control+a')
  await input.type(text)
  await input.press('Enter')
}

test('couleurs nommées : créer, renommer, modifier (les éléments suivent), supprimer (ils gardent la couleur)', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await expect(panel(page).getByRole('heading', { name: 'Couleurs nommées' })).toBeVisible()
  await panel(page).getByRole('button', { name: 'Ajouter une couleur nommée' }).click()
  expect((await styles(page)).colors).toEqual([{ id: expect.any(String), name: 'Couleur 1', value: '#0D99FF' }])
  await typeInto(page, 'Nom de la couleur 1', 'Marque')
  await typeInto(page, 'Couleur nommée 1', 'c2410c')
  expect((await styles(page)).colors[0]).toMatchObject({ name: 'Marque', value: '#C2410C' })

  await clickOn(page, 'rBleu1')
  await panel(page).getByRole('button', { name: 'Couleur nommée pour le remplissage 1' }).click()
  await page.getByRole('option', { name: /Marque/ }).click()
  await page.mouse.click(5, 5)
  await page.keyboard.press('Escape')
  await typeInto(page, 'Couleur nommée 1', '15803d')
  await expect(page.locator('[data-node-id="rBleu1"]')).toHaveCSS('background-color', 'rgb(21, 128, 61)')
  await panel(page).getByRole('button', { name: 'Supprimer la couleur nommée Marque' }).click()
  expect(await docNode(page, 'rBleu1')).toMatchObject({ fills: ['#15803D'] })
  await app.close()
})

test('créer une couleur nommée depuis la sélection ; styles de texte', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await panel(page).getByRole('button', { name: 'Créer une couleur nommée depuis le remplissage 1' }).click()
  const s = await styles(page)
  expect(s.colors).toHaveLength(1)
  expect(await docNode(page, 'rBleu1')).toMatchObject({ fills: [{ style: s.colors[0]!.id }] })

  await page.mouse.click(5, 5)
  await page.keyboard.press('Escape')
  await panel(page).getByRole('button', { name: 'Ajouter un style de texte' }).click()
  expect((await styles(page)).text).toHaveLength(1)
  await typeInto(page, 'Taille du style 1', '40')
  expect((await styles(page)).text[0]).toMatchObject({ fontSize: 40 })
  await app.close()
})
