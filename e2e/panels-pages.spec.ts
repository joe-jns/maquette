import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { boxOf, scene, settled } from './canvas'

const pageNames = (page: Page) => page.locator('[data-testid="pages"] [data-page-id]').allInnerTexts()

test('trois zones : calques à gauche, canevas, propriétés à droite ; le cadrage tient dans le canevas', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  const left = (await page.getByTestId('left-panel').boundingBox())!
  const right = (await page.getByTestId('right-panel').boundingBox())!
  const canvas = (await page.getByTestId('canvas').boundingBox())!
  expect(left.width).toBeGreaterThan(200)
  expect(right.width).toBeGreaterThan(200)
  expect(canvas.x).toBeGreaterThanOrEqual(left.x + left.width - 1)
  const hero = await boxOf(page, 'fHero1')
  const libre = await boxOf(page, 'fLibre')
  expect(hero.x).toBeGreaterThanOrEqual(canvas.x)
  expect(libre.x + libre.width).toBeLessThanOrEqual(right.x + 1)
  await app.close()
})

test('pages : ajouter, renommer, changer, supprimer, annuler', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  expect(await pageNames(page)).toEqual(['Scène'])
  await page.getByRole('button', { name: 'Add page' }).click()
  expect(await pageNames(page)).toEqual(['Scène', 'Page 2'])
  await expect(page.locator('[data-node-id="rBleu1"]')).toHaveCount(0)

  await page.locator('[data-page-id]', { hasText: 'Page 2' }).dblclick()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Contact')
  await page.keyboard.press('Enter')
  expect(await pageNames(page)).toEqual(['Scène', 'Contact'])

  await page.locator('[data-page-id]', { hasText: 'Contact' }).dblclick()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Enter')
  expect(await pageNames(page)).toEqual(['Scène', 'Contact'])

  await page.locator('[data-page-id]', { hasText: 'Scène' }).click()
  await expect(page.locator('[data-node-id="rBleu1"]')).toBeVisible()

  await page.locator('[data-page-id]', { hasText: 'Contact' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete page' }).click()
  expect(await pageNames(page)).toEqual(['Scène'])
  await page.locator('[data-page-id]', { hasText: 'Scène' }).click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Delete page' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+z')
  expect(await pageNames(page)).toEqual(['Scène', 'Contact'])
  await app.close()
})
