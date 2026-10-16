import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export async function launch(args: string[] = []): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.', ...args], env: { ...process.env, MAQUETTE_E2E: '1' } })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}
