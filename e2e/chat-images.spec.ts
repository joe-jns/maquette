import { test, expect, type Locator, type Page } from '@playwright/test'
import { engineSetup } from './chat'
import { launch } from './launch'

/** Panneau du chat branché au faux `claude` : outils dépliables, images jointes et vues par Claude. */

async function start(env: Record<string, string>, file: string) {
  const { app, page } = await launch([file], env)
  await expect(page.getByTestId('canvas')).toBeVisible()
  const panel = page.getByTestId('chat-panel')
  // Relance : le panneau rouvre seul (état retenu).
  if (!(await panel.isVisible())) await page.keyboard.press('Control+l')
  await expect(panel).toBeVisible()
  return { app, page, panel }
}

/** Image vraiment chargée (pas une icône cassée). */
const loaded = (img: Locator) => img.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : 0))

async function sendMessage(page: Page, text: string) {
  const box = page.getByRole('textbox', { name: 'Message to Claude' })
  await box.fill(text)
  await box.press('Enter')
}

test('image jointe : vignette sous le message, encore là après relance, aperçu en grand', async () => {
  const s = engineSetup()
  let { app, page, panel } = await start(s.env, s.file)
  try {
    // Image de 120 × 80 collée dans la saisie (même chemin que coller / glisser).
    const png = await app.evaluate(({ nativeImage }) => {
      const w = 120
      const h = 80
      const px = Buffer.alloc(w * h * 4)
      for (let i = 0; i < w * h; i++) px.set([0x22, 0x99, 0xff, 0xff], i * 4)
      return nativeImage.createFromBitmap(px, { width: w, height: h }).toPNG().toString('base64')
    })
    await page.evaluate((data) => {
      const store = (window as unknown as { __chatStore: { getState(): { addImage(i: { mediaType: string; data: string }): boolean } } }).__chatStore
      store.getState().addImage({ mediaType: 'image/png', data })
    }, png)
    await expect(panel.locator('.chat-thumb img')).toHaveCount(1)
    await sendMessage(page, 'voici une image')
    await expect(panel.locator('.chat-assistant').last()).toHaveText('1 image(s) reçue(s)')
    const thumb = panel.locator('.chat-user .chat-image img')
    await expect(thumb).toHaveCount(1)
    await expect.poll(() => loaded(thumb)).toBe(120)
    await expect(panel.locator('.chat-bubble')).toHaveText('voici une image')
  } finally {
    await app.close()
  }

  // Relance : l'historique garde la vignette.
  ;({ app, page, panel } = await start(s.env, s.file))
  try {
    const thumb = panel.locator('.chat-user .chat-image img')
    await expect(thumb).toHaveCount(1)
    await expect.poll(() => loaded(thumb)).toBe(120)

    const button = panel.getByRole('button', { name: 'Enlarge attached image' })
    await button.click()
    const box = page.getByRole('dialog', { name: 'Image preview' })
    await expect(box).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close preview' })).toBeFocused()
    await expect.poll(() => loaded(box.locator('img'))).toBe(120)
    await page.keyboard.press('Escape')
    await expect(box).toHaveCount(0)
    await expect(button).toBeFocused()
    // Échap a seulement fermé l'aperçu : le chat reste ouvert.
    await expect(panel).toBeVisible()
  } finally {
    await app.close()
  }
})

test('outil déplié : entrée et résultat ; image vue par Claude en vignette, même ligne repliée', async () => {
  const s = engineSetup()
  const { app, page, panel } = await start(s.env, s.file)
  try {
    await sendMessage(page, 'regarde le hero')
    await expect(panel.locator('.chat-assistant').last()).toHaveText('Le hero est bien centré.')
    const line = panel.getByRole('button', { name: /Looking at the render/ })
    await expect(line).toHaveAttribute('aria-expanded', 'false')
    // Repliée : petite vignette de ce que Claude a regardé.
    const peek = line.locator('.chat-tool-peek')
    await expect(peek).toBeVisible()
    await expect.poll(() => loaded(peek)).toBe(240)

    await line.click()
    await expect(line).toHaveAttribute('aria-expanded', 'true')
    const detail = panel.locator('.chat-tool-detail')
    await expect(detail.getByRole('region', { name: 'Input' }).locator('pre')).toContainText('"id": "fHero1"')
    await expect(detail.getByRole('region', { name: 'Result' }).locator('pre')).toHaveText('capture de Hero (1440×600)')
    await expect(detail.getByRole('button', { name: 'Copy input' })).toBeVisible()
    const seen = detail.locator('.chat-image img')
    await expect.poll(() => loaded(seen)).toBe(240)
    await expect(peek).toHaveCount(0)

    // Aperçu en grand : un clic sur le fond le ferme.
    await detail.getByRole('button', { name: 'Enlarge image seen by Claude' }).click()
    const box = page.getByRole('dialog', { name: 'Image preview' })
    await expect(box).toBeVisible()
    await box.click({ position: { x: 10, y: 10 } })
    await expect(box).toHaveCount(0)

    // Clavier : Entrée replie, Espace redéplie.
    await line.focus()
    await page.keyboard.press('Enter')
    await expect(line).toHaveAttribute('aria-expanded', 'false')
    await expect(detail).toHaveCount(0)
    await page.keyboard.press(' ')
    await expect(line).toHaveAttribute('aria-expanded', 'true')
  } finally {
    await app.close()
  }
})

test('commande : entrée et résultat dans le détail', async () => {
  const s = engineSetup()
  const { app, page, panel } = await start(s.env, s.file)
  try {
    await sendMessage(page, 'lance une commande')
    await panel.getByRole('button', { name: 'Always allow in this conversation' }).click()
    await expect(panel.locator('.chat-assistant').last()).toHaveText('autorisé')
    const line = panel.getByRole('button', { name: /Running a command/ })
    await line.click()
    await expect(panel.getByRole('region', { name: 'Input' }).locator('pre')).toHaveText('echo hi')
    await expect(panel.getByRole('region', { name: 'Result' }).locator('pre')).toHaveText('hi')
  } finally {
    await app.close()
  }
})
