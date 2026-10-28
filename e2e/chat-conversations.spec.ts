import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { engineSetup, type EngineSetup } from './chat'
import { launch } from './launch'

/**
 * Plusieurs conversations par fichier, avec le faux `claude` (jamais le vrai) : menu du titre, bascule
 * avec la bonne session (--resume), renommage, suppression confirmée dans la fenêtre de l'app,
 * « Nouvelle conversation » qui garde l'ancienne, conversations des autres fichiers.
 */

const SHOT = process.env.MAQUETTE_MENU_SHOT
const readLog = (s: EngineSetup) => (existsSync(s.log) ? readFileSync(s.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
const launches = (s: EngineSetup) => readLog(s).filter((e) => e.argv) as { argv: string[] }[]
const resumeOf = (argv: string[]) => (argv.includes('--resume') ? argv[argv.indexOf('--resume') + 1] : undefined)
interface Saved { id: string; title: string | null; sessionId: string | null; items: unknown[] }
const saved = (s: EngineSetup, path = s.file): Saved[] => {
  try {
    return JSON.parse(readFileSync(join(s.userData, 'chats.json'), 'utf8'))[path]?.conversations ?? []
  } catch {
    return []
  }
}

async function openChat(page: Page) {
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+l')
  const panel = page.getByTestId('chat-panel')
  await expect(panel).toBeVisible()
  return panel
}

async function say(page: Page, text: string, answer: string) {
  const field = page.getByRole('textbox', { name: 'Message to Claude' })
  await field.fill(text)
  await field.press('Enter')
  await expect(page.getByTestId('chat-panel').locator('.chat-assistant').last()).toHaveText(answer, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
}

/** Ouvre le menu des conversations depuis le titre. */
async function menu(page: Page) {
  await page.getByTestId('chat-title').click()
  const m = page.getByTestId('chat-conversations')
  await expect(m).toBeVisible()
  return m
}
const rowTitles = (page: Page) => page.getByTestId('chat-conversations').locator('.conv-row .menu-label')

/** Aucune boîte native : les questions passent par la fenêtre de l'app. */
async function watchNativeDialogs(app: ElectronApplication) {
  await app.evaluate(({ dialog }) => {
    const g = globalThis as unknown as { __native: string[] }
    g.__native = []
    for (const name of ['showMessageBox', 'showMessageBoxSync'] as const) {
      ;(dialog as unknown as Record<string, unknown>)[name] = () => {
        g.__native.push(name)
        return name.endsWith('Sync') ? 0 : Promise.resolve({ response: 0, checkboxChecked: false })
      }
    }
  })
}
const nativeDialogs = (app: ElectronApplication) => app.evaluate(() => (globalThis as unknown as { __native: string[] }).__native)

test('deux conversations : la nouvelle garde l’ancienne, bascule avec le bon --resume, renommer, supprimer', async () => {
  const s = engineSetup()
  const { app, page } = await launch([s.file], s.env)
  try {
    await watchNativeDialogs(app)
    const panel = await openChat(page)
    const title = page.getByTestId('chat-title')
    await expect(title).toHaveText('New conversation')

    await say(page, 'Premier sujet', 'Reçu.')
    await expect(title).toHaveText('Premier sujet')

    // « Nouvelle conversation » : rien n'est effacé, la première reste dans la liste.
    await panel.getByRole('button', { name: 'New conversation' }).click()
    await expect(panel.locator('.chat-bubble')).toHaveCount(0)
    await expect(title).toHaveText('New conversation')
    await say(page, 'Deuxième sujet', 'Reçu.')
    await expect(title).toHaveText('Deuxième sujet')
    await expect.poll(() => saved(s).map((c) => c.title ?? (c.items[0] as { text: string }).text).sort()).toEqual(['Deuxième sujet', 'Premier sujet'])
    const [first, second] = ['Premier sujet', 'Deuxième sujet'].map((t) => saved(s).find((c) => (c.items[0] as { text: string }).text === t)!)
    expect(first!.sessionId).toBeTruthy()
    expect(second!.sessionId).toBeTruthy()
    expect(second!.sessionId).not.toBe(first!.sessionId)
    expect(launches(s)).toHaveLength(2)
    expect(resumeOf(launches(s)[1]!.argv)).toBeUndefined()

    // Menu : la plus récente d'abord, la conversation ouverte cochée, date relative.
    let m = await menu(page)
    await expect(rowTitles(page)).toHaveText(['Deuxième sujet', 'Premier sujet'])
    await expect(m.getByRole('menuitemradio', { name: /Deuxième sujet/ })).toHaveAttribute('aria-checked', 'true')
    await expect(m.locator('.conv-date').first()).toHaveText(/^Today \d\d:\d\d$/)

    // Bascule : l'historique de la première s'affiche, la suite reprend SA session.
    await m.getByRole('menuitemradio', { name: /Premier sujet/ }).click()
    await expect(m).toHaveCount(0)
    await expect(panel.locator('.chat-bubble')).toHaveText(['Premier sujet'])
    await expect(title).toHaveText('Premier sujet')
    await say(page, 'suite du premier', 'Reçu.')
    expect(launches(s)).toHaveLength(3)
    expect(resumeOf(launches(s)[2]!.argv)).toBe(first!.sessionId)
    await expect(panel.locator('.chat-bubble')).toHaveText(['Premier sujet', 'suite du premier'])

    // Et retour à la deuxième : sa session à elle.
    m = await menu(page)
    await expect(rowTitles(page)).toHaveText(['Premier sujet', 'Deuxième sujet'])
    await m.getByRole('menuitemradio', { name: /Deuxième sujet/ }).click()
    await expect(panel.locator('.chat-bubble')).toHaveText(['Deuxième sujet'])
    await say(page, 'suite du deuxième', 'Reçu.')
    expect(resumeOf(launches(s)[3]!.argv)).toBe(second!.sessionId)

    // Renommer en place.
    m = await menu(page)
    const row = m.locator('.conv-row', { hasText: 'Premier sujet' })
    await row.hover()
    await row.getByRole('button', { name: 'Rename “Premier sujet”' }).click()
    const field = m.getByRole('textbox', { name: 'New conversation title' })
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('Premier sujet')
    await field.fill('Tarifs')
    await field.press('Enter')
    await expect(rowTitles(page)).toHaveText(['Deuxième sujet', 'Tarifs'])
    await expect.poll(() => saved(s).find((c) => c.id === first!.id)?.title).toBe('Tarifs')
    // Échap annule.
    await m.locator('.conv-row', { hasText: 'Tarifs' }).hover()
    await m.getByRole('button', { name: 'Rename “Tarifs”' }).click()
    await m.getByRole('textbox', { name: 'New conversation title' }).fill('Autre chose')
    await m.getByRole('textbox', { name: 'New conversation title' }).press('Escape')
    await expect(rowTitles(page)).toHaveText(['Deuxième sujet', 'Tarifs'])

    // Supprimer la conversation ouverte : confirmation dans la fenêtre de l'app, Annuler ne fait rien.
    let del = m.locator('.conv-row', { hasText: 'Deuxième sujet' })
    await del.hover()
    await del.getByRole('button', { name: 'Delete “Deuxième sujet”' }).click()
    const ask = page.getByRole('dialog', { name: 'Delete the conversation “Deuxième sujet”?' })
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(ask).toHaveCount(0)
    expect(saved(s)).toHaveLength(2)
    m = await menu(page)
    del = m.locator('.conv-row', { hasText: 'Deuxième sujet' })
    await del.hover()
    await del.getByRole('button', { name: 'Delete “Deuxième sujet”' }).click()
    await ask.getByRole('button', { name: 'Delete' }).click()
    await expect(ask).toHaveCount(0)
    // La conversation restante s'ouvre.
    await expect(title).toHaveText('Tarifs')
    await expect(panel.locator('.chat-bubble')).toHaveText(['Premier sujet', 'suite du premier'])
    await expect.poll(() => saved(s).map((c) => c.id)).toEqual([first!.id])
    expect(await nativeDialogs(app)).toEqual([])

    // Pendant une réponse : pas de nouvelle conversation ni de bascule, on le dit.
    const field2 = page.getByRole('textbox', { name: 'Message to Claude' })
    await field2.fill('un long texte')
    await field2.press('Enter')
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'New conversation' })).toBeDisabled()
    m = await menu(page)
    await expect(m.locator('.conv-notice')).toContainText('stop the reply')
    await page.keyboard.press('Escape')
    await expect(m).toHaveCount(0)
    await panel.getByRole('button', { name: 'Stop' }).click()
    await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
  }
})

test('autres fichiers : ancien historique migré, ouverture du fichier puis de sa conversation, fichier introuvable grisé', async () => {
  const s = engineSetup()
  const other = join(s.dir, 'autre maquette.maquette')
  copyFileSync(resolve('e2e/fixtures/scene.maquette'), other)
  const missing = join(s.dir, 'disparue.maquette')
  const stamp = Date.now() - 60_000
  // Ancien format de chats.json : une conversation par fichier.
  mkdirSync(s.userData, { recursive: true })
  writeFileSync(join(s.userData, 'chats.json'), JSON.stringify({
    [other]: { sessionId: 'sess-autre', items: [{ kind: 'user', id: `u-${stamp.toString(36)}-1`, text: 'Sujet de l’autre fichier', images: 0 }, { kind: 'assistant', id: 'a1', text: 'Réponse ancienne' }] },
    [missing]: { sessionId: null, items: [{ kind: 'user', id: `u-${(stamp - 1000).toString(36)}-2`, text: 'Sujet perdu', images: 0 }] },
  }))
  const { app, page } = await launch([s.file], s.env)
  try {
    const panel = await openChat(page)
    await say(page, 'Sujet du fichier ouvert', 'Reçu.')
    await panel.getByRole('button', { name: 'New conversation' }).click()
    await say(page, 'Section tarifs à trois colonnes', 'Reçu.')

    const m = await menu(page)
    await expect(rowTitles(page)).toHaveText(['Section tarifs à trois colonnes', 'Sujet du fichier ouvert'])
    await expect(m.locator('.conv-section')).toHaveText('Other files')
    const others = m.locator('.conv-other')
    await expect(others).toHaveCount(2)
    await expect(others.nth(0)).toContainText('Sujet de l’autre fichier')
    await expect(others.nth(0).locator('.conv-file')).toHaveText('autre maquette')
    await expect(others.nth(1)).toContainText('Sujet perdu')
    await expect(others.nth(1)).toHaveAttribute('aria-disabled', 'true')
    await expect(others.nth(1)).toHaveAttribute('data-tooltip', `File not found: ${missing}`)
    if (SHOT) {
      mkdirSync(join(SHOT, '..'), { recursive: true })
      await m.locator('.conv-row').nth(1).hover()
      await page.screenshot({ path: SHOT })
    }
    // Introuvable : un clic ne fait rien.
    await others.nth(1).click({ force: true })
    await expect(m).toBeVisible()

    // Le fichier s'ouvre (document propre : pas de question), puis sa conversation.
    await others.nth(0).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { filePath: string | null } } }).__maquetteStore.getState().filePath)).toBe(other)
    await expect(panel.locator('.chat-bubble')).toHaveText(['Sujet de l’autre fichier'])
    await expect(page.getByTestId('chat-title')).toHaveText('Sujet de l’autre fichier')
    await say(page, 'on reprend', 'Reçu.')
    expect(resumeOf(launches(s).at(-1)!.argv)).toBe('sess-autre')

    // Et le premier fichier est maintenant dans « Autres fichiers ».
    const m2 = await menu(page)
    await expect(m2.locator('.conv-other .menu-label')).toHaveText(['Section tarifs à trois colonnes', 'Sujet du fichier ouvert', 'Sujet perdu'])
    // Le fichier est réécrit au nouveau format, sans perte.
    const migrated = saved(s, other)
    expect(migrated).toHaveLength(1)
    expect(migrated[0]!.items).toHaveLength(4)
  } finally {
    await app.close()
  }
})
