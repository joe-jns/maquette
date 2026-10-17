import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { engineSetup, type EngineSetup } from './chat'
import { launch } from './launch'

/**
 * Réglages du chat avec le faux `claude` (jamais le vrai) : interrupteur taste-skill de l'en-tête,
 * mémorisé par conversation ; un changement relance claude avec --resume au message suivant.
 */

const readLog = (s: EngineSetup) => (existsSync(s.log) ? readFileSync(s.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
const launches = (s: EngineSetup) => readLog(s).filter((e) => e.argv) as { argv: string[] }[]
const flag = (argv: string[], name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
const promptOf = (argv: string[]) => readFileSync(flag(argv, '--append-system-prompt-file')!, 'utf8')

async function openChat(page: Page) {
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+l')
  const panel = page.getByTestId('chat-panel')
  await expect(panel).toBeVisible()
  return panel
}

async function say(page: Page, text: string, answer: string) {
  const field = page.getByRole('textbox', { name: 'Message à Claude' })
  await field.fill(text)
  await field.press('Enter')
  await expect(page.getByTestId('chat-panel').locator('.chat-assistant').last()).toHaveText(answer, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Envoyer' })).toBeVisible()
}

/** Textes des messages reçus par le faux claude. */
const received = (s: EngineSetup) =>
  readLog(s)
    .filter((e) => e.line?.type === 'user')
    .map((e) => (e.line.message.content as { type: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n'))

test('style comme Pen : dialogue de vignettes, pastille retirable, joint au message, mémorisé', async () => {
  const s = engineSetup()
  const { app, page } = await launch([s.file], s.env)
  try {
    const panel = await openChat(page)
    await expect(panel.getByTestId('chat-style')).toHaveCount(0)
    await panel.getByRole('button', { name: 'Style', exact: true }).click()
    const dialog = page.getByTestId('chat-style-picker')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Choisir un style' })).toBeVisible()
    // « Aucun style » d'abord et choisi par défaut, puis les 52 styles de Pen.
    const tiles = dialog.locator('.chat-style-picker-grid > button')
    await expect(tiles).toHaveCount(53)
    await expect(tiles.first()).toContainText('Aucun style')
    await expect(tiles.first()).toContainText('Le prompt décide')
    await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true')
    await expect(tiles.nth(1)).toContainText('Centered Serif List - Prismatic White')
    // Les vignettes web et mobile se chargent (protocole maquette-chat://style).
    const swiss = dialog.getByRole('button', { name: 'Swiss Type Atlas' })
    await swiss.scrollIntoViewIfNeeded()
    await expect.poll(() => swiss.locator('img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).naturalWidth))).toEqual([360, 220])

    // Échap ferme sans rien changer.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await panel.getByRole('button', { name: 'Style', exact: true }).click()
    await dialog.getByRole('button', { name: 'Swiss Type Atlas' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(panel.getByTestId('chat-style')).toHaveText('Style : Swiss Type Atlas')

    // Joint au message pour Claude, pas dans la bulle.
    await say(page, 'bonjour', 'Bonjour !')
    await expect(panel.locator('.chat-bubble')).toHaveText(['bonjour'])
    const [text] = received(s)
    expect(text).toContain('Use the following style: Swiss Type Atlas\n- headings: ')
    expect(text).toContain('- colorPalette: ')
    expect(text).toContain('style("Swiss Type Atlas", "Swiss Type Atlas", appliquer:true)')
    expect(text!.endsWith('\n\nbonjour')).toBe(true)

    // Mémorisé avec la conversation ; le dialogue montre le choix.
    const options = () => page.evaluate(() => (window as unknown as { maquette: { chat: { options(): Promise<{ style: { name: string } | null }> } } }).maquette.chat.options())
    expect((await options()).style?.name).toBe('Swiss Type Atlas')
    await panel.getByRole('button', { name: 'Style', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Swiss Type Atlas' })).toHaveAttribute('aria-pressed', 'true')
    await dialog.getByRole('button', { name: 'Fermer' }).click()

    // Retirer la pastille : plus de style, plus rien de joint.
    await panel.getByRole('button', { name: 'Retirer le style' }).click()
    await expect(panel.getByTestId('chat-style')).toHaveCount(0)
    await expect.poll(async () => (await options()).style).toBeNull()
    await say(page, 'encore', 'Reçu.')
    expect(received(s)[1]).toBe('encore')
  } finally {
    await app.close()
  }
})

test('interrupteur taste-skill : éteint par défaut, relance avec --resume et l’autre consigne, mémorisé', async () => {
  const s = engineSetup()
  const { app, page } = await launch([s.file], s.env)
  try {
    const panel = await openChat(page)
    const box = panel.getByTestId('chat-taste').getByRole('checkbox', { name: 'taste-skill' })
    await expect(box).toHaveAttribute('aria-checked', 'false')

    await say(page, 'bonjour', 'Bonjour !')
    expect(launches(s)).toHaveLength(1)
    const first = launches(s)[0]!.argv
    expect(flag(first, '--resume')).toBeUndefined()
    expect(promptOf(first)).toContain('choose the Pen style archetype that fits the subject')

    // Allumé : rien ne se relance tout de suite…
    await box.click()
    await expect(box).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => page.evaluate(() => (window as unknown as { maquette: { chat: { options(): Promise<unknown> } } }).maquette.chat.options())).toEqual({ taste: true, style: null })
    expect(launches(s)).toHaveLength(1)

    // …mais au message suivant : nouveau claude, même conversation, consigne taste-skill.
    await say(page, 'encore', 'Reçu.')
    expect(launches(s)).toHaveLength(2)
    const second = launches(s)[1]!.argv
    expect(flag(second, '--resume')).toBeTruthy()
    expect(promptOf(second)).toContain('mandatory taste-skill method')
    // L'historique est intact.
    await expect(panel.locator('.chat-bubble')).toHaveText(['bonjour', 'encore'])

    // Sans changement : le même claude continue.
    await say(page, 'toujours là', 'Reçu.')
    expect(launches(s)).toHaveLength(2)

    // Mémorisé avec la conversation du fichier ; « Nouvelle conversation » le garde.
    await panel.getByRole('button', { name: 'Nouvelle conversation' }).click()
    await expect(panel.locator('.chat-bubble')).toHaveCount(0)
    await expect(box).toHaveAttribute('aria-checked', 'true')
    const reopened = await page.evaluate(async (file) => {
      const chat = (window as unknown as { maquette: { chat: { open(p: string | null): Promise<unknown>; options(): Promise<unknown> } } }).maquette.chat
      await chat.open(null)
      const untitled = await chat.options()
      await chat.open(file)
      return [untitled, await chat.options()]
    }, s.file)
    expect(reopened).toEqual([{ taste: false, style: null }, { taste: true, style: null }])

    // Éteint de nouveau : retour à la méthode de Pen au message suivant.
    await box.click()
    await expect(box).toHaveAttribute('aria-checked', 'false')
    await say(page, 'bonjour', 'Bonjour !')
    const last = launches(s).at(-1)!.argv
    expect(promptOf(last)).toContain('choose the Pen style archetype that fits the subject')
  } finally {
    await app.close()
  }
})
