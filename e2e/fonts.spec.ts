import { test, expect } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

const fixture = (name: string) => join(__dirname, 'fixtures', name)

let fontsDir: string
test.beforeEach(async () => {
  fontsDir = await mkdtemp(join(tmpdir(), 'maquette-polices-'))
})
test.afterEach(async () => {
  await rm(fontsDir, { recursive: true, force: true })
})

const offline = () => ({ MAQUETTE_FONTS_OFFLINE: '1', MAQUETTE_FONTS_DIR: fontsDir })

test('un texte en Arial s’affiche en Arial, sans réseau et sans bandeau', async () => {
  const { app, page } = await launch([fixture('demo.maquette')], offline())
  const titre = page.locator('[data-node-id="tTitre"]')
  await expect(titre).toHaveText('Bonjour Maquette')
  await expect(titre).toHaveCSS('font-family', /^"?Arial"?$/)
  // La police installée est réellement dessinée (document.fonts.check répond true même pour une police absente).
  const rendered = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!
    const text = 'Bonjour Maquette'
    ctx.font = '72px monospace'
    const mono = ctx.measureText(text).width
    ctx.font = '72px "Arial", monospace'
    return ctx.measureText(text).width !== mono
  })
  expect(rendered).toBe(true)
  // Aucune feuille injectée : c'est la police installée qui sert.
  await expect(page.locator('style[data-font-family]')).toHaveCount(0)
  await page.waitForTimeout(500)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await app.close()
})

test('une police inconnue dans un fichier est signalée par le bandeau', async () => {
  const { app, page } = await launch([fixture('police-inconnue.maquette')], offline())
  await expect(page.locator('[data-node-id="tInco1"]')).toHaveText('Police qui n’existe pas')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Font not found: Police Inexistante Zz')
  await expect(alert).toContainText('displayed with the default font instead')
  // Signalée une seule fois : une fois fermé, le bandeau ne revient pas.
  await alert.getByRole('button', { name: 'Close' }).click()
  await expect(alert).toHaveCount(0)
  await page.waitForTimeout(300)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await app.close()
})

test('hors connexion, le catalogue de secours est renvoyé', async () => {
  const { app, page } = await launch([], offline())
  const families = await page.evaluate(async () => (await window.maquette.fontCatalog()).map((f) => f.family))
  expect(families).toContain('Inter')
  expect(families).toContain('Arial')
  expect(await page.evaluate(() => window.maquette.fontCss('Inter'))).toBeNull()
  await app.close()
})

test('avec le réseau, une police Google est téléchargée et chargée (FONTS_LIVE=1)', async () => {
  test.skip(process.env.FONTS_LIVE !== '1', 'réseau requis : lancer avec FONTS_LIVE=1')
  test.setTimeout(90_000)
  const { app, page } = await launch([fixture('playfair.maquette')], { MAQUETTE_FONTS_DIR: fontsDir })
  await expect(page.locator('[data-node-id="tPlayf"]')).toHaveText('Playfair Display')
  await expect(page.locator('style[data-font-family="Playfair Display"]')).toHaveCount(1, { timeout: 60_000 })
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.fonts.check('700 16px "Playfair Display"') &&
            [...document.fonts].some((f) => f.family.includes('Playfair Display') && f.status === 'loaded'),
        ),
      { timeout: 60_000 },
    )
    .toBe(true)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await app.close()
})
