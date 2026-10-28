import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { centerOf, clickOn, docNode, scene, settled } from './canvas'

const field = (page: Page, name: string) => page.getByTestId('right-panel').getByRole('textbox', { name, exact: true })

async function typeInto(page: Page, name: string, text: string) {
  const input = field(page, name)
  await input.click()
  await input.press('Control+a')
  await input.type(text)
  await input.press('Enter')
}

test('largeur : calcul, saisie invalide, glisser sur l’étiquette avec une seule annulation', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await expect(field(page, 'Width')).toHaveValue('100')
  await typeInto(page, 'Width', '24*2')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ width: 48 })
  await typeInto(page, 'Width', 'abc')
  await expect(field(page, 'Width')).toHaveValue('48')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ width: 48 })

  const label = page.getByTestId('right-panel').getByTestId('scrub-Width')
  const box = (await label.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(await docNode(page, 'rBleu1')).toMatchObject({ width: 78 })
  await page.mouse.click(5, 5)
  await page.keyboard.press('Control+z')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ width: 48 })
  await app.close()
})

test('sélection multiple : « Mixte », et une saisie s’applique à tous', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await typeInto(page, 'Width', '60')
  await clickOn(page, 'rVert1', ['Shift'])
  await expect(field(page, 'Width')).toHaveValue('')
  await expect(field(page, 'Width')).toHaveAttribute('placeholder', 'Mixed')
  await typeInto(page, 'Width', '90')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ width: 90 })
  expect(await docNode(page, 'rVert1')).toMatchObject({ width: 90 })
  await app.close()
})

test('modes de taille : dans le champ, impossibles grisés avec la raison, absents sans choix, bascule fixe/contenu', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  // Un rectangle posé librement n'a qu'une taille fixe : pas de menu de mode.
  await expect(field(page, 'Width')).toHaveValue('100')
  await expect(page.getByRole('combobox', { name: 'Width mode' })).toHaveCount(0)
  await clickOn(page, 'fHero1')
  const height = page.getByRole('combobox', { name: 'Height mode' })
  await expect(height).toHaveText('Hug')
  await page.getByRole('combobox', { name: 'Width mode' }).click()
  const fill = page.getByRole('option', { name: 'Fill' })
  await expect(fill).toHaveAttribute('aria-disabled', 'true')
  await expect(fill).toHaveAttribute('data-tooltip', /children/)
  await fill.dispatchEvent('click')
  expect(await docNode(page, 'fHero1')).toMatchObject({ width: 600 })
  await page.keyboard.press('Escape')
  await height.click()
  await expect(page.getByRole('option', { name: 'Hug' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('option', { name: /^Fixed/ }).click()
  expect(typeof ((await docNode(page, 'fHero1')) as { height: unknown }).height).toBe('number')
  await expect(page.getByRole('combobox', { name: 'Height mode' })).not.toHaveText('Hug')
  await app.close()
})

test('opacité en %, position désactivée pour un enfant en flux', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await typeInto(page, 'Opacity', '50')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ opacity: 0.5 })
  const c = await centerOf(page, 'tTitre')
  await page.mouse.dblclick(c.x, c.y)
  await expect(field(page, 'X')).toBeDisabled()
  await app.close()
})

test('une valeur tapée sans valider, puis un clic sur un autre élément : elle va au premier, jamais au second', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  const input = field(page, 'Width')
  await input.click()
  await input.press('Control+a')
  await input.type('200')
  await clickOn(page, 'rVert1')
  expect(await docNode(page, 'rVert1')).toMatchObject({ width: 100 })
  expect(await docNode(page, 'rBleu1')).toMatchObject({ width: 200 })
  await app.close()
})
