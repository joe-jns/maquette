import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { docNode, scene, selection, settled } from './canvas'

const panel = (page: Page) => page.getByTestId('right-panel')
const select = (page: Page, ids: string[]) =>
  page.evaluate((s) => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select(s), ids)
type Sized = { x: number; y: number; width: unknown }

test('liste déroulante : souris, clavier (↑ ↓ Entrée Échap, lettres), dans la fenêtre', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'tTitre')
  await select(page, ['tTitre'])
  const weight = panel(page).getByRole('combobox', { name: 'Graisse', exact: true })
  await expect(weight).toHaveText('Bold')

  // Souris : la liste s'ouvre, la valeur choisie est cochée, un clic choisit.
  await weight.click()
  const list = page.getByRole('listbox', { name: 'Graisse' })
  await expect(list).toBeVisible()
  await expect(list.getByRole('option', { name: /Bold/ })).toHaveAttribute('aria-selected', 'true')
  const box = (await list.boundingBox())!
  const view = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(view.width)
  expect(box.y + box.height).toBeLessThanOrEqual(view.height)
  await list.getByRole('option', { name: /Regular/ }).click()
  await expect(list).toHaveCount(0)
  expect(await docNode(page, 'tTitre')).toMatchObject({ fontWeight: 400 })

  // Clavier : ↓ ouvre, ↓ descend, Entrée choisit et rend le focus au champ.
  await weight.focus()
  await page.keyboard.press('ArrowDown')
  await expect(list).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  expect(await docNode(page, 'tTitre')).toMatchObject({ fontWeight: 700 })
  await expect(weight).toBeFocused()

  // Une lettre saute à l'option ; Échap ferme sans rien changer ni désélectionner.
  await page.keyboard.press('Enter')
  await page.keyboard.press('r')
  await expect(list.getByRole('option', { name: /Regular/ })).toHaveClass(/is-active/)
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  expect(await docNode(page, 'tTitre')).toMatchObject({ fontWeight: 700 })
  expect(await selection(page)).toEqual(['tTitre'])
  await page.keyboard.press('r')
  await page.keyboard.press('Enter')
  expect(await docNode(page, 'tTitre')).toMatchObject({ fontWeight: 400 })
  await app.close()
})

test('case à cocher : clic sur le libellé, Espace, état lu par les lecteurs d’écran', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'fHero1')
  await select(page, ['fHero1'])
  const wrap = panel(page).getByRole('checkbox', { name: 'Retour à la ligne' })
  await expect(wrap).toHaveAttribute('aria-checked', 'false')
  await panel(page).getByText('Retour à la ligne').click()
  await expect(wrap).toHaveAttribute('aria-checked', 'true')
  expect(await docNode(page, 'fHero1')).toMatchObject({ layout: { wrap: true } })
  await wrap.focus()
  await page.keyboard.press('Space')
  await expect(wrap).toHaveAttribute('aria-checked', 'false')
  expect(await docNode(page, 'fHero1')).toMatchObject({ layout: { wrap: false } })
  await app.close()
})

test('aligner : sur la boîte commune ou sur le parent, une seule annulation', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  const before = { bleu: (await docNode(page, 'rBleu1')) as Sized, libre: (await docNode(page, 'fLibre')) as Sized }
  await select(page, ['rBleu1', 'fLibre'])
  await panel(page).getByRole('button', { name: 'Aligner à gauche' }).click()
  const left = Math.min(before.bleu.x, before.libre.x)
  expect(await docNode(page, 'rBleu1')).toMatchObject({ x: left, y: before.bleu.y })
  expect(await docNode(page, 'fLibre')).toMatchObject({ x: left, y: before.libre.y })
  await page.mouse.click(5, 5)
  await page.keyboard.press('Control+z')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ x: before.bleu.x })
  expect(await docNode(page, 'fLibre')).toMatchObject({ x: before.libre.x })

  // Un seul élément s'aligne sur son cadre parent ; seul sur la page, rien à aligner.
  await select(page, ['rDedan'])
  await panel(page).getByRole('button', { name: 'Aligner à droite' }).click()
  const inner = (await docNode(page, 'rDedan')) as Sized
  expect(inner.x + (inner.width as number)).toBe(before.libre.width)
  await select(page, ['rBleu1'])
  await expect(panel(page).getByRole('button', { name: 'Aligner à droite' })).toBeDisabled()
  await app.close()
})

test('mode de taille dans le champ : remplir, puis contenu', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'tTitre')
  await select(page, ['tTitre'])
  const mode = panel(page).getByRole('combobox', { name: 'Largeur : mode' })
  await mode.click()
  await page.getByRole('option', { name: 'Remplir' }).click()
  expect(await docNode(page, 'tTitre')).toMatchObject({ width: { mode: 'fill' } })
  await expect(mode).toHaveText('Remplir')
  await mode.click()
  await page.getByRole('option', { name: 'Contenu' }).click()
  expect(await docNode(page, 'tTitre')).toMatchObject({ width: { mode: 'hug' } })
  await expect(mode).toHaveText('Contenu')
  await app.close()
})
