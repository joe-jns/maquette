import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { clickOn, docNode, scene, settled } from './canvas'

const panel = (page: Page) => page.getByTestId('right-panel')
const variables = (page: Page) => page.getByTestId('floating-variables')
/** Ouvre le panneau Variables de la barre du bas (un clic sur le canevas le referme). */
const openVariables = async (page: Page) => {
  if (!(await variables(page).isVisible())) await page.getByRole('button', { name: 'Variables', exact: true }).click()
  await expect(variables(page)).toBeVisible()
}
const styles = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: { styles: { colors: { id: string; name: string; value: string }[]; text: { name: string; fontSize: number }[] } } } } }).__maquetteStore.getState().doc.styles)

async function typeInto(page: Page, name: string, text: string, where = panel(page)) {
  const input = where.getByRole('textbox', { name, exact: true })
  await input.click()
  await input.press('Control+a')
  await input.type(text)
  await input.press('Enter')
}

test('couleurs nommées : créer, renommer, modifier (les éléments suivent), supprimer (ils gardent la couleur)', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await openVariables(page)
  await expect(variables(page).getByRole('heading', { name: 'Colors' })).toBeVisible()
  await variables(page).getByRole('button', { name: 'Add color' }).click()
  expect((await styles(page)).colors).toEqual([{ id: expect.any(String), name: 'Color 1', value: '#0D99FF' }])
  await typeInto(page, 'Color 1 name', 'Marque', variables(page))
  await typeInto(page, 'Color 1', 'c2410c', variables(page))
  expect((await styles(page)).colors[0]).toMatchObject({ name: 'Marque', value: '#C2410C' })
  // La fenêtre Variables couvre le canevas : on la ferme avant de sélectionner.
  await page.keyboard.press('Escape')
  await expect(variables(page)).toBeHidden()

  await clickOn(page, 'rBleu1')
  await panel(page).getByRole('button', { name: 'Color variable for fill 1' }).click()
  await page.getByRole('option', { name: /Marque/ }).click()
  await page.mouse.click(5, 5)
  await page.keyboard.press('Escape')
  await openVariables(page)
  await typeInto(page, 'Color 1', '15803d', variables(page))
  await expect(page.locator('[data-node-id="rBleu1"]')).toHaveCSS('background-color', 'rgb(21, 128, 61)')
  await variables(page).getByRole('button', { name: 'Delete color Marque' }).click()
  expect(await docNode(page, 'rBleu1')).toMatchObject({ fills: ['#15803D'] })
  await app.close()
})

test('créer une couleur nommée depuis la sélection ; styles de texte', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await panel(page).getByRole('button', { name: 'Create color variable from fill 1' }).click()
  const s = await styles(page)
  expect(s.colors).toHaveLength(1)
  expect(await docNode(page, 'rBleu1')).toMatchObject({ fills: [{ style: s.colors[0]!.id }] })

  await page.mouse.click(5, 5)
  await page.keyboard.press('Escape')
  await openVariables(page)
  await variables(page).getByRole('button', { name: 'Add text style' }).click()
  expect((await styles(page)).text).toHaveLength(1)
  await typeInto(page, 'Text style 1 size', '40', variables(page))
  expect((await styles(page)).text[0]).toMatchObject({ fontSize: 40 })
  await app.close()
})
