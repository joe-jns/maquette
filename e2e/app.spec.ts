import { test, expect } from '@playwright/test'
import { launch } from './launch'

test('la fenêtre Maquette s’ouvre', async () => {
  const { app, page } = await launch()
  await expect(page.getByTestId('app-root')).toBeVisible()
  expect(await page.title()).toContain('Maquette')
  await app.close()
})
