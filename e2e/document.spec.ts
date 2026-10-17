import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { launch } from './launch'

const fixture = (name: string) => join(__dirname, 'fixtures', name)

test('un document passé en argument est affiché avec sa mise en page automatique', async () => {
  const { app, page } = await launch([fixture('demo.maquette')])
  const titre = page.locator('[data-node-id="tTitre"]')
  const suite = page.locator('[data-node-id="tSuite"]')
  await expect(titre).toHaveText('Bonjour Maquette')
  await expect(suite).toHaveText('Été « deuxième » ligne')
  await expect(titre).toHaveCSS('color', 'rgb(194, 65, 12)')
  await expect(page.locator('[data-node-id="fHero1"]')).toHaveCSS('display', 'flex')
  const a = (await titre.boundingBox())!
  const b = (await suite.boundingBox())!
  expect(Math.round(b.y - a.y)).toBe(48 + 16)
  await app.close()
})

test('un fichier qui n’est pas une maquette affiche une alerte au lieu de planter', async () => {
  const { app, page } = await launch([fixture('pas-une-maquette.maquette')])
  await expect(page.getByRole('alert')).toContainText('n’est pas un document Maquette')
  // Rien d'ouvert : l'accueil, qui reste utilisable (nouvelle maquette → l'éditeur).
  await expect(page.getByTestId('home')).toBeVisible()
  await page.getByTestId('home').getByRole('button', { name: 'Nouvelle maquette' }).first().click()
  await expect(page.locator('.canvas')).toBeVisible()
  await app.close()
})

test('un fichier imparfait est ouvert, réparé et signalé', async () => {
  const { app, page } = await launch([fixture('a-reparer.maquette')])
  await expect(page.locator('[data-node-id="tSeul1"]')).toHaveText('Sans position')
  await expect(page.getByRole('alert')).toContainText('a-reparer.maquette ouvert avec 1 réparation')
  await expect(page).toHaveTitle('a-reparer.maquette • — Maquette')
  await app.close()
})
