import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Lance l'application ; `env` s'ajoute à l'environnement (ex. MAQUETTE_FONTS_OFFLINE). */
export async function launch(
  args: string[] = [],
  env: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  // Chaque lancement a ses propres données (copies de secours, récents) ; le cache des polices est partagé.
  const isolated = { MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-e2e-')), MAQUETTE_FONTS_DIR: join(tmpdir(), 'maquette-e2e-fonts') }
  const app = await electron.launch({ args: ['.', ...args], env: { ...process.env, ...isolated, ...env, MAQUETTE_E2E: '1' } })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}
