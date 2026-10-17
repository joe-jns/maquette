import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

/** Lance l'application ; `env` s'ajoute à l'environnement (ex. MAQUETTE_FONTS_OFFLINE). */
export async function launch(
  args: string[] = [],
  env: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.', ...args], env: { ...process.env, ...env, MAQUETTE_E2E: '1' } })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}
