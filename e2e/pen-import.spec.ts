import { test, expect, type ElectronApplication } from '@playwright/test'
import { cp, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

/** Copie de la fixture .pen (et de son image) dans un dossier avec espaces et accents. */
async function penCopy(): Promise<{ dir: string; pen: string; original: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'pen é import '))
  await cp(join(__dirname, 'fixtures', 'pen'), dir, { recursive: true })
  const pen = join(dir, 'demo.pen')
  return { dir, pen, original: await readFile(pen, 'utf8') }
}

const menu = (app: ElectronApplication, cmd: string) =>
  app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())!.webContents.send('menu', c), cmd)

test('ouvrir un .pen : calques, instance, image, rapport ; Enregistrer propose <nom>.maquette, le .pen reste intact', async () => {
  const { dir, pen, original } = await penCopy()
  const { app, page } = await launch([pen])
  try {
    // Rapport : ce qui n'a pas été repris tel quel.
    const report = page.getByRole('dialog', { name: 'Pen import' })
    await expect(report).toContainText('demo.pen was opened as a new design')
    await expect(report).toContainText('1 × Notes, prompts and AI context removed')
    await expect(report).toContainText('1 × Strokes on some sides only, drawn as shadows')
    await expect(report).toContainText('1 × Other themes not imported')
    await report.getByRole('button', { name: 'OK' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect(page).toHaveTitle('demo — Maquette')
    await expect(page.locator('[data-node-id="penTitre"]')).toHaveText('Bonjour Pen')
    // L'instance du bouton : texte surchargé, lien vers le principal.
    const doc = await page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: unknown } } }).__maquetteStore.getState().doc)
    const json = JSON.stringify(doc)
    expect(json).toContain('"instanceOf":"penBtn"')
    expect(json).toContain('"content":"Commencer"')
    await expect(page.locator('[data-node-id="penCta"]')).toContainText('Commencer')
    await expect(page.locator('[data-node-id="penBtn"]')).toContainText('Button')
    // Calques : le principal et l'écran, la note est retirée.
    await expect(page.locator('[data-node-id="penNote"]')).toHaveCount(0)
    // Image du .pen : copiée dans le dossier d'attente, servie par masset://.
    await expect.poll(() => page.locator('[data-node-id="penPhoto"]').evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/masset:\/\/doc\/assets\//)
    const loaded = await page.locator('[data-node-id="penPhoto"]').evaluate(async (el) => {
      const url = /url\("([^"]+)"\)/.exec(getComputedStyle(el).backgroundImage)![1]!
      const img = new Image()
      img.src = url
      await img.decode()
      return img.naturalWidth
    })
    expect(loaded).toBe(8)

    // Enregistrer : boîte « Enregistrer sous » proposant demo.maquette à côté du .pen.
    const proposed = await app.evaluate(({ dialog }) => {
      const seen: { defaultPath?: string }[] = []
      ;(globalThis as unknown as { __seen: typeof seen }).__seen = seen
      dialog.showSaveDialog = (async (...args: unknown[]) => {
        const opts = (args.length > 1 ? args[1] : args[0]) as { defaultPath?: string }
        seen.push(opts)
        return { canceled: false, filePath: opts.defaultPath }
      }) as typeof dialog.showSaveDialog
      return true
    })
    expect(proposed).toBe(true)
    await menu(app, 'save')
    await expect(page).toHaveTitle('demo.maquette — Maquette')
    const defaultPath = await app.evaluate(() => (globalThis as unknown as { __seen: { defaultPath?: string }[] }).__seen[0]?.defaultPath)
    expect(defaultPath?.toLowerCase()).toBe(join(dir, 'demo.maquette').toLowerCase())
    const saved = JSON.parse(await readFile(join(dir, 'demo.maquette'), 'utf8'))
    expect(saved.format).toBe('maquette')
    // L'image a suivi le document ; le .pen n'a pas bougé.
    expect((await readdir(join(dir, 'assets'))).filter((f) => f.endsWith('.png'))).toHaveLength(1)
    expect(await readFile(pen, 'utf8')).toBe(original)
    expect((await readdir(dir)).sort()).toEqual(['assets', 'demo.maquette', 'demo.pen', 'images'])
  } finally {
    await app.close()
  }
})

test('Fichier → Ouvrir accepte les .pen ; un .pen illisible est refusé avec un message', async () => {
  const { dir, pen } = await penCopy()
  const bad = join(dir, 'chiffré.pen')
  await writeFile(bad, 'pas du json')
  const { app, page } = await launch()
  try {
    await app.evaluate(({ dialog }, path) => {
      ;(globalThis as unknown as { __filters: unknown }).__filters = null
      dialog.showOpenDialog = (async (...args: unknown[]) => {
        const opts = (args.length > 1 ? args[1] : args[0]) as { filters: unknown }
        ;(globalThis as unknown as { __filters: unknown }).__filters = opts.filters
        return { canceled: false, filePaths: [path] }
      }) as typeof dialog.showOpenDialog
    }, pen)
    await menu(app, 'open')
    await page.getByRole('dialog', { name: 'Pen import' }).getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('[data-node-id="penTitre"]')).toHaveText('Bonjour Pen')
    const filters = await app.evaluate(() => (globalThis as unknown as { __filters: { extensions: string[] }[] }).__filters)
    expect(filters[0]!.extensions).toEqual(['maquette', 'pen'])

    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as unknown as typeof dialog.showOpenDialog
    }, bad)
    await menu(app, 'open')
    await expect(page.getByRole('alert')).toContainText('not a readable Pen document')
    // Le document affiché n'a pas changé.
    await expect(page.locator('[data-node-id="penTitre"]')).toHaveText('Bonjour Pen')
  } finally {
    await app.close()
  }
})
