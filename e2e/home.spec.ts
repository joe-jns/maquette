import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { copyFile, readFile, readdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

const fixtures = join(__dirname, 'fixtures')

/** Données isolées : deux fichiers (Studio Été plus récent que Boulangerie) et un fichier disparu. */
async function prepare() {
  const userData = mkdtempSync(join(tmpdir(), 'maquette-home-data-'))
  const dir = mkdtempSync(join(tmpdir(), 'maquette-home-'))
  const older = join(dir, 'Boulangerie.maquette')
  const newer = join(dir, 'Studio Été.maquette')
  const missing = join(dir, 'Disparu.maquette')
  await copyFile(join(fixtures, 'scene.maquette'), older)
  await copyFile(join(fixtures, 'demo.maquette'), newer)
  const now = Date.now() / 1000
  await utimes(older, now - 3 * 86400, now - 3 * 86400)
  await utimes(newer, now - 2 * 3600, now - 2 * 3600)
  // L'ordre des récents (dernier ouvert d'abord) n'est pas celui des dates : l'accueil trie par date.
  await writeFile(join(userData, 'recent.json'), JSON.stringify([older, missing, newer]), 'utf8')
  return { userData, older, newer, missing }
}

const cards = (page: Page) => page.getByTestId('home-card')
const card = (page: Page, name: string) => cards(page).filter({ has: page.locator('.home-card-name', { hasText: name }) })
const filePath = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { filePath: string | null } } }).__maquetteStore.getState().filePath)
const menu = (app: ElectronApplication, cmd: string) =>
  app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())!.webContents.send('menu', c), cmd)
const thumbFiles = async (userData: string) => (await readdir(join(userData, 'thumbs')).catch(() => [] as string[])).filter((f) => f.endsWith('.jpg'))

test('lancement sans fichier : l’accueil liste les récents, le plus récent d’abord ; introuvable grisé', async () => {
  const { userData, missing } = await prepare()
  const { app, page } = await launch([], { MAQUETTE_USER_DATA: userData }, { home: true })
  try {
    const home = page.getByTestId('home')
    await expect(home).toBeVisible()
    await expect(home.getByRole('heading', { name: 'Maquette' })).toBeVisible()
    await expect(page.getByTestId('canvas')).toBeHidden()
    await expect(cards(page).locator('.home-card-name')).toHaveText(['Studio Été', 'Boulangerie', 'Disparu'])
    await expect(card(page, 'Studio Été')).toContainText('Edited 2 hours ago')
    await expect(card(page, 'Boulangerie')).toContainText(/Edited [A-Z][a-z]+ \d/)
    await expect(home.locator('.home-section-count')).toHaveText('3')

    const lost = card(page, 'Disparu')
    await expect(lost).toHaveClass(/is-missing/)
    await expect(lost).toContainText('Not found')
    await expect(lost).toHaveAttribute('data-path', missing)
    // Le cliquer n'ouvre rien : seul son menu (Retirer) s'ouvre.
    await lost.locator('.home-card-open').click()
    const actions = page.getByRole('menu')
    await expect(actions.getByRole('menuitem', { name: 'Open' })).toBeDisabled()
    await expect(actions.getByRole('menuitem', { name: 'Remove from recents' })).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(actions).toHaveCount(0)

    // Aucun document derrière : Échap ne quitte pas l'accueil, et pas de bouton « Retour ».
    await page.getByRole('searchbox', { name: 'Search files' }).focus()
    await page.keyboard.press('Escape')
    await expect(home).toBeVisible()
    await expect(home.getByRole('button', { name: 'Back to document' })).toHaveCount(0)
    expect(await filePath(page)).toBeNull()
  } finally {
    await app.close()
  }
})

test('recherche : filtre par nom, sans accents ; aucun résultat expliqué', async () => {
  const { userData } = await prepare()
  const { app, page } = await launch([], { MAQUETTE_USER_DATA: userData }, { home: true })
  try {
    const search = page.getByRole('searchbox', { name: 'Search files' })
    await expect(cards(page)).toHaveCount(3)
    // Le focus est sur l'accueil ; taper cherche directement.
    await expect(page.getByTestId('home')).toBeFocused()
    await page.keyboard.type('ete')
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('ete')
    await expect(cards(page).locator('.home-card-name')).toHaveText(['Studio Été'])
    await expect(page.locator('.home-section-count')).toHaveText('1 of 3')
    await search.fill('zzz')
    await expect(cards(page)).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveText('No files match “zzz”.')
    // Échap dans la recherche : la vide d'abord.
    await page.keyboard.press('Escape')
    await expect(search).toHaveValue('')
    await expect(cards(page)).toHaveCount(3)
  } finally {
    await app.close()
  }
})

test('ouvrir une carte (souris, puis clavier) ; aperçu fait à l’ouverture', async () => {
  const { userData, older, newer } = await prepare()
  const { app, page } = await launch([], { MAQUETTE_USER_DATA: userData }, { home: true })
  try {
    await card(page, 'Boulangerie').locator('.home-card-open').click()
    await expect(page.getByTestId('home')).toHaveCount(0)
    await expect(page.getByTestId('canvas')).toBeVisible()
    await expect(page.locator('[data-node-id="fHero1"]')).toBeVisible()
    expect(await filePath(page)).toBe(older)
    // Ouvert sans aperçu : il est rendu peu après, dans les données de l'app (pas à côté du fichier).
    await expect.poll(() => thumbFiles(userData), { timeout: 20_000 }).toHaveLength(1)

    // Clavier : ↓ depuis l'accueil, → vers la carte suivante, Entrée ouvre. Un élément sélectionné
    // dans le document caché ne doit pas bouger sous les flèches.
    await page.evaluate(() => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select(['fHero1']))
    await menu(app, 'home')
    await expect(page.getByTestId('home')).toBeVisible()
    await expect(page.getByTestId('home')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(card(page, 'Studio Été').locator('.home-card-open')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(card(page, 'Boulangerie').locator('.home-card-open')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(card(page, 'Studio Été').locator('.home-card-open')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Delete')
    expect(await page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { dirty: boolean } } }).__maquetteStore.getState().dirty)).toBe(false)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('home')).toHaveCount(0)
    expect(await filePath(page)).toBe(newer)
    await expect(page.locator('[data-node-id="tTitre"]')).toHaveText('Bonjour Maquette')
  } finally {
    await app.close()
  }
})

test('Fichier → Accueil puis Échap revient au document ; menu ▾ ; document modifié protégé', async () => {
  const { userData, older } = await prepare()
  const { app, page } = await launch([older], { MAQUETTE_USER_DATA: userData })
  try {
    await expect(page.locator('[data-node-id="fHero1"]')).toBeVisible()
    // Menu de l'app : Fichier → Accueil, avec son raccourci.
    const item = await app.evaluate(({ Menu }) => {
      const first = Menu.getApplicationMenu()!.items[0]!.submenu!.items[0]!
      return { label: first.label, accelerator: first.accelerator }
    })
    expect(item).toEqual({ label: 'Home', accelerator: 'CmdOrCtrl+Shift+H' })

    await menu(app, 'home')
    const home = page.getByTestId('home')
    await expect(home).toBeVisible()
    await expect(page.getByTestId('canvas')).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(home).toHaveCount(0)
    await expect(page.getByTestId('canvas')).toBeVisible()
    expect(await filePath(page)).toBe(older)

    // Menu ▾ de l'en-tête, puis le bouton « Retour ».
    await page.getByTestId('file-header').getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Home' }).click()
    await expect(home).toBeVisible()
    await home.getByRole('button', { name: 'Back to document' }).click()
    await expect(home).toHaveCount(0)

    // Document modifié : ouvrir une carte demande d'abord ; Annuler garde tout, accueil compris.
    await page.evaluate(() => {
      const store = (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { id: string }[] }; dispatch(ops: unknown[], label: string): unknown } } }).__maquetteStore
      store.getState().dispatch([{ op: 'create', parent: store.getState().doc.pages[0]!.id, node: { type: 'shape', shape: 'rectangle', name: 'New', x: 0, y: 0, width: 10, height: 10 } }], 'test')
    })
    await menu(app, 'home')
    await card(page, 'Studio Été').locator('.home-card-open').click()
    const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(home).toBeVisible()
    expect(await filePath(page)).toBe(older)
    await page.keyboard.press('Escape')
    await expect(home).toHaveCount(0)
    await expect(page).toHaveTitle(/•/)
  } finally {
    await app.close()
  }
})

test('menu d’une carte : Afficher dans l’Explorateur, Retirer de la liste', async () => {
  const { userData, newer, missing } = await prepare()
  const { app, page } = await launch([], { MAQUETTE_USER_DATA: userData }, { home: true })
  try {
    // L'Explorateur ne s'ouvre jamais pendant les tests : on note seulement l'appel.
    await app.evaluate(({ shell }) => {
      const calls: string[] = []
      ;(globalThis as unknown as { __shown: string[] }).__shown = calls
      shell.showItemInFolder = (path: string) => void calls.push(path)
    })
    await card(page, 'Studio Été').hover()
    await card(page, 'Studio Été').getByRole('button', { name: 'Actions for Studio Été' }).click()
    await page.getByRole('menuitem', { name: 'Show in Explorer' }).click()
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { __shown: string[] }).__shown)).toEqual([newer])

    // Clic droit sur la carte introuvable : Retirer.
    await card(page, 'Disparu').locator('.home-card-open').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Remove from recents' }).click()
    await expect(cards(page).locator('.home-card-name')).toHaveText(['Studio Été', 'Boulangerie'])
    const recent = JSON.parse(await readFile(join(userData, 'recent.json'), 'utf8')) as string[]
    expect(recent).not.toContain(missing)
    expect(recent).toHaveLength(2)
    // Le menu Fichier → Ouvrir un fichier récent suit.
    const labels = await app.evaluate(({ Menu }) => {
      const recentMenu = Menu.getApplicationMenu()!.items[0]!.submenu!.items.find((i) => i.label === 'Open recent')!
      return recentMenu.submenu!.items.map((i) => i.label)
    })
    expect(labels).toHaveLength(2)
  } finally {
    await app.close()
  }
})

test('aucun récent : l’accueil le dit et propose les deux boutons', async () => {
  const { app, page } = await launch([], {}, { home: true })
  try {
    const empty = page.getByTestId('home-empty')
    await expect(empty).toContainText('No recent files')
    await expect(empty.getByRole('button', { name: 'New design' })).toBeVisible()
    await expect(empty.getByRole('button', { name: 'Open…' })).toBeVisible()
    await expect(cards(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('aperçu généré après Ctrl+S, dans userData/thumbs, montré sur la carte', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'maquette-home-save-'))
  const target = join(mkdtempSync(join(tmpdir(), 'maquette-home-out-')), 'Atelier.maquette')
  const { app, page } = await launch([], { MAQUETTE_USER_DATA: userData })
  try {
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = (() => Promise.resolve({ canceled: false, filePath: path })) as unknown as typeof dialog.showSaveDialog
    }, target)
    await page.evaluate(() => {
      const store = (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { id: string }[] }; dispatch(ops: unknown[], label: string): unknown } } }).__maquetteStore
      store.getState().dispatch([{ op: 'create', parent: store.getState().doc.pages[0]!.id, node: { type: 'frame', name: 'Accueil', x: 0, y: 0, width: 1440, height: 900, fills: ['#2563EB'] } }], 'test')
    })
    expect(await thumbFiles(userData)).toEqual([])
    // Fichier → Enregistrer (Ctrl+S) : la fenêtre de test, hors écran, n'a pas le focus du clavier.
    await menu(app, 'save')
    await expect.poll(() => filePath(page)).toBe(target)
    await expect.poll(() => thumbFiles(userData), { timeout: 20_000 }).toHaveLength(1)
    const [name] = await thumbFiles(userData)
    expect(name).toMatch(/^[0-9a-f]{40}\.jpg$/)
    const bytes = await readFile(join(userData, 'thumbs', name!))
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8])
    // Le fichier .maquette, lui, n'a rien reçu d'autre que le document.
    expect(JSON.parse(await readFile(target, 'utf8')).format).toBe('maquette')

    await menu(app, 'home')
    const img = card(page, 'Atelier').locator('.home-thumb img')
    await expect(img).toHaveAttribute('src', /^data:image\/jpeg;base64,/)
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(640)
  } finally {
    await app.close()
  }
})
