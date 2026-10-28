import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Lance l'application ; `env` s'ajoute à l'environnement (ex. MAQUETTE_FONTS_OFFLINE).
 *
 * Sans fichier, l'app s'ouvre sur l'accueil : on y clique « Nouvelle maquette », comme l'utilisateur,
 * pour partir d'un document vide. `{ home: true }` laisse l'accueil affiché.
 */
export async function launch(
  args: string[] = [],
  env: Record<string, string> = {},
  opts: { home?: boolean } = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  // Chaque lancement a ses propres données (copies de secours, récents) ; le cache des polices est partagé.
  const isolated = { MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-e2e-')), MAQUETTE_FONTS_DIR: join(tmpdir(), 'maquette-e2e-fonts') }
  const app = await electron.launch({ args: ['.', ...args], env: { ...process.env, ...isolated, ...env, MAQUETTE_E2E: '1' } })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  if (!opts.home && !args.some((a) => a.toLowerCase().endsWith('.maquette'))) await startBlank(page)
  return { app, page }
}

/** Depuis l'accueil : « Nouvelle maquette », puis l'éditeur est là. */
export async function startBlank(page: Page): Promise<void> {
  const home = page.getByTestId('home')
  await home.getByRole('button', { name: 'New design' }).first().click()
  await expect(home).toHaveCount(0)
  await expect(page.getByTestId('canvas')).toBeVisible()
}
