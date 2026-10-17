import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'
import { clickOn, docNode, scene, settled } from './canvas'

const panel = (page: Page) => page.getByTestId('right-panel')
async function typeInto(page: Page, name: string, text: string) {
  const input = panel(page).getByRole('textbox', { name, exact: true })
  await input.click()
  await input.press('Control+a')
  await input.type(text)
  await input.press('Enter')
}
type Frame = { layout: Record<string, unknown> }

test('mise en page automatique : ajouter, direction, espacement, alignement, retirer', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'fLibre')
  await clickOn(page, 'fLibre')
  await panel(page).getByRole('button', { name: 'Ajouter la mise en page automatique' }).click()
  expect(((await docNode(page, 'fLibre')) as unknown as Frame).layout).toMatchObject({ mode: 'auto' })
  await panel(page).getByRole('button', { name: 'Direction : ligne' }).click()
  expect(((await docNode(page, 'fLibre')) as unknown as Frame).layout).toMatchObject({ direction: 'row' })
  await typeInto(page, 'Espacement', '12')
  expect(((await docNode(page, 'fLibre')) as unknown as Frame).layout).toMatchObject({ gap: 12 })
  await panel(page).getByRole('button', { name: 'Aligner au centre' }).click()
  expect(((await docNode(page, 'fLibre')) as unknown as Frame).layout).toMatchObject({ justify: 'center', align: 'center' })
  await typeInto(page, 'Marge horizontale', '20')
  expect(((await docNode(page, 'fLibre')) as unknown as Frame).layout).toMatchObject({ padding: [expect.any(Number), 20, expect.any(Number), 20] })
  await panel(page).getByRole('button', { name: 'Retirer la mise en page automatique' }).click()
  expect(((await docNode(page, 'fLibre')) as unknown as Frame).layout).toEqual({ mode: 'free' })
  await app.close()
})

test('couleur de remplissage, contour, ombre', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await expect(panel(page).getByRole('textbox', { name: 'Remplissage 1', exact: true })).toHaveValue('93C5FD')
  await typeInto(page, 'Remplissage 1', 'f00')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ fills: ['#FF0000'] })
  await typeInto(page, 'Opacité du remplissage 1', '50')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ fills: ['#FF000080'] })
  await panel(page).getByRole('button', { name: 'Ajouter un contour' }).click()
  expect(await docNode(page, 'rBleu1')).toMatchObject({ stroke: { width: 1, align: 'inside' } })
  await typeInto(page, 'Épaisseur du contour', '3')
  await panel(page).getByRole('button', { name: 'Contour : extérieur' }).click()
  expect(await docNode(page, 'rBleu1')).toMatchObject({ stroke: { width: 3, align: 'outside' } })
  await panel(page).getByRole('button', { name: 'Ajouter une ombre' }).click()
  expect(((await docNode(page, 'rBleu1')) as unknown as { shadows: unknown[] }).shadows).toHaveLength(1)
  await typeInto(page, 'Flou de l’ombre 1', '24')
  expect(await docNode(page, 'rBleu1')).toMatchObject({ shadows: [{ blur: 24 }] })
  await app.close()
})

test('appliquer une couleur nommée puis la détacher', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.evaluate(() => {
    const s = (window as unknown as { __maquetteStore: { getState(): { dispatch(o: unknown[], l: string): unknown } } }).__maquetteStore
    s.getState().dispatch([{ op: 'style.color.set', id: '$c', name: 'Accent', value: '#C2410C' }], 'test')
  })
  await clickOn(page, 'rBleu1')
  await panel(page).getByRole('button', { name: 'Couleur nommée pour le remplissage 1' }).click()
  await page.getByRole('option', { name: /Accent/ }).click()
  const n = (await docNode(page, 'rBleu1')) as unknown as { fills: unknown[] }
  expect(n.fills[0]).toMatchObject({ style: expect.any(String) })
  await expect(panel(page)).toContainText('Accent')
  await panel(page).getByRole('button', { name: 'Détacher la couleur nommée' }).click()
  expect(await docNode(page, 'rBleu1')).toMatchObject({ fills: ['#C2410C'] })
  await app.close()
})

test('texte : choisir une police, taille, alignement, couleur', async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const fonts = await mkdtemp(join(tmpdir(), 'polices-hors-ligne '))
  const { app, page } = await launch([scene], { MAQUETTE_FONTS_OFFLINE: '1', MAQUETTE_FONTS_DIR: fonts })
  await settled(page, 'tTitre')
  const { centerOf } = await import('./canvas')
  const c = await centerOf(page, 'tTitre')
  await page.mouse.dblclick(c.x, c.y)
  await panel(page).getByRole('button', { name: 'Police' }).click()
  await page.getByRole('searchbox', { name: 'Rechercher une police' }).fill('Georg')
  await page.getByRole('option', { name: /Georgia/ }).click()
  expect(await docNode(page, 'tTitre')).toMatchObject({ fontFamily: 'Georgia' })
  await typeInto(page, 'Taille du texte', '32')
  expect(await docNode(page, 'tTitre')).toMatchObject({ fontSize: 32 })
  await panel(page).getByRole('button', { name: 'Aligner le texte : centre' }).click()
  expect(await docNode(page, 'tTitre')).toMatchObject({ textAlign: 'center' })
  await typeInto(page, 'Couleur du texte', '0d99ff')
  expect(await docNode(page, 'tTitre')).toMatchObject({ color: '#0D99FF' })
  await app.close()
})
