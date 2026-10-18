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
    await expect.poll(() => page.evaluate(() => (window as unknown as { maquette: { chat: { options(): Promise<{ taste: boolean }> } } }).maquette.chat.options())).toEqual({ taste: true })
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
    expect(reopened).toEqual([{ taste: false }, { taste: true }])

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
