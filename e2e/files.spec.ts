import { test, expect, type Page } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

const demo = join(__dirname, 'fixtures', 'demo.maquette')
const scene = join(__dirname, 'fixtures', 'scene.maquette')

const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __maquetteStore: { getState(): { filePath: string | null; doc: { pages: { name: string }[] } } } }).__maquetteStore.getState()
    return { path: s.filePath, pages: s.doc.pages.map((p) => p.name) }
  })

test('fichier modifié sur le disque : bandeau, Recharger ; notre enregistrement ne déclenche rien', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'maquette-watch-'))
  const file = join(dir, 'site.maquette')
  await copyFile(demo, file)
  const { app, page } = await launch([file])
  try {
    await expect.poll(async () => (await state(page)).path).toBe(file)

    // Enregistrer depuis l'app : pas d'alerte.
    // Fenêtre de test hors écran et sans focus : le raccourci du menu ne lui arrive pas, on passe par le menu.
    const before = (await stat(file)).mtimeMs
    await app.evaluate(({ Menu }) => {
      const fichier = Menu.getApplicationMenu()!.items[0]!.submenu!
      fichier.items.find((i) => i.label === 'Save')!.click()
    })
    await expect.poll(async () => (await stat(file)).mtimeMs, { timeout: 15_000 }).toBeGreaterThan(before)
    await page.waitForTimeout(1200)
    await expect(page.getByTestId('file-changed')).toHaveCount(0)

    // Un autre programme réécrit le fichier : alerte, puis rechargement.
    const doc = JSON.parse(await readFile(file, 'utf8'))
    doc.pages[0].name = 'Changée ailleurs'
    await writeFile(file, JSON.stringify(doc), 'utf8')
    const banner = page.getByTestId('file-changed')
    await expect(banner).toBeVisible({ timeout: 5000 })
    await banner.getByRole('button', { name: 'Reload' }).click()
    await expect.poll(async () => (await state(page)).pages[0]).toBe('Changée ailleurs')
  } finally {
    await app.close()
  }
})

test('fichiers récents : le menu liste le fichier ouvert', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'maquette-recent-'))
  const file = join(dir, 'récent & co.maquette')
  await copyFile(demo, file)
  const userData = mkdtempSync(join(tmpdir(), 'maquette-recent-data-'))
  const { app, page } = await launch([file], { MAQUETTE_USER_DATA: userData })
  try {
    await expect.poll(async () => (await state(page)).path).toBe(file)
    const labels = () =>
      app.evaluate(({ Menu }) => {
        const fichier = Menu.getApplicationMenu()!.items[0]!.submenu!
        const recent = fichier.items.find((i) => i.label === 'Open recent')!
        return recent.submenu!.items.map((i) => i.label)
      })
    await expect.poll(labels).toEqual([file.replace(/&/g, '&&')])
    expect(JSON.parse(await readFile(join(userData, 'recent.json'), 'utf8'))).toEqual([file])
  } finally {
    await app.close()
  }
})

test('une seule Maquette : un second lancement avec un fichier l’ouvre dans la première fenêtre', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'maquette-single-'))
  const { app, page } = await launch([], { MAQUETTE_USER_DATA: userData })
  try {
    await expect(page.getByTestId('canvas')).toBeVisible()
    const exe = await app.evaluate(() => process.execPath)
    const second = spawn(exe, ['.', scene], { env: { ...process.env, MAQUETTE_USER_DATA: userData, MAQUETTE_E2E: '1' }, stdio: 'ignore' })
    const code = await new Promise<number | null>((resolve) => second.on('exit', resolve))
    expect(code).toBe(0)
    await expect.poll(async () => (await state(page)).path).toBe(scene)
    expect(app.windows().filter((w) => !w.url().includes('export'))).toHaveLength(1)
  } finally {
    await app.close()
  }
})

test('enregistrement automatique : le fichier suit les modifications ; désactivable ; jamais de boîte pour un sans-titre', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'maquette-autosave-'))
  const file = join(dir, 'auto.maquette')
  await copyFile(scene, file)
  const { app, page } = await launch([file])
  const rename = (name: string) =>
    page.evaluate((n) => {
      const s = (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { id: string }[] }; dispatch(ops: unknown[], label: string): unknown } } }).__maquetteStore.getState()
      s.dispatch([{ op: 'page.update', id: s.doc.pages[0]!.id, name: n }], 'test')
    }, name)
  const onDisk = async () => JSON.parse(await readFile(file, 'utf8')).pages[0].name as string
  try {
    await expect.poll(async () => (await state(page)).path).toBe(file)
    await rename('Auto 1')
    await expect(page.getByTestId('file-dirty')).toBeVisible()
    // Quelques secondes après la modification : écrit sur le disque, plus « modifié », pas d'alerte de fichier changé.
    await expect.poll(onDisk, { timeout: 8000 }).toBe('Auto 1')
    await expect(page.getByTestId('file-dirty')).toHaveCount(0)
    await expect(page.getByTestId('file-changed')).toHaveCount(0)

    // Désactivé dans le menu du fichier : le disque ne bouge plus.
    await page.getByTestId('file-header').getByRole('button').click()
    await page.getByRole('menuitemradio', { name: 'Auto-save' }).click()
    await rename('Auto 2')
    await page.waitForTimeout(3500)
    expect(await onDisk()).toBe('Auto 1')
    await expect(page.getByTestId('file-dirty')).toBeVisible()
  } finally {
    await app.close()
  }

  // Document jamais enregistré : l'enregistrement silencieux refuse sans ouvrir de boîte « Save as ».
  const blank = await launch([])
  try {
    const result = await blank.page.evaluate(() =>
      Promise.race([
        (window as unknown as { maquette: { saveFile(p: string | null, t: string, o: { silent: boolean }): Promise<string | null> } }).maquette.saveFile(null, '{}', { silent: true }),
        new Promise((r) => setTimeout(() => r('boîte ouverte'), 3000)),
      ]),
    )
    expect(result).toBeNull()
  } finally {
    await blank.app.close()
  }
})
