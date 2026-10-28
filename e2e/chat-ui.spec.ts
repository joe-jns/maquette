import { test, expect, type Page } from '@playwright/test'
import { node, scene } from './canvas'
import { calls, emit, fakeChat, reopen } from './chat'
import { launch } from './launch'

const select = (page: Page, ids: string[]) =>
  page.evaluate((s) => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select(s), ids)

const nodeCount = (page: Page) =>
  page.evaluate(() => {
    const doc = (window as unknown as { __maquetteStore: { getState(): { doc: unknown } } }).__maquetteStore.getState().doc
    return JSON.stringify(doc).match(/"id":/g)!.length
  })

test('Ctrl+L, historique, texte au fil de l’eau, autorisation, Stop', async () => {
  const { app, page } = await launch([scene])
  try {
    await expect(page.locator(node('rBleu1'))).toBeVisible()
    await fakeChat(app, [
      { kind: 'user', id: 'u1', text: 'Fais une section tarifs', images: 1 },
      { kind: 'assistant', id: 'a1', text: 'Voici **trois** colonnes :\n\n- Base\n- Pro' },
      { kind: 'tool', id: 't1', name: 'appliquer', summary: '12 éléments', status: 'done' },
    ])
    await reopen(page)

    const panel = page.getByTestId('chat-panel')
    await expect(panel).toHaveCount(0)
    await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+l')
    await expect(panel).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Message à Claude' })).toBeFocused()

    // Historique.
    await expect(panel.locator('.chat-bubble')).toContainText('Fais une section tarifs')
    await expect(panel.locator('.chat-bubble')).toContainText('+ 1 image')
    await expect(panel.locator('.chat-assistant strong')).toHaveText('trois')
    await expect(panel.locator('.chat-assistant li')).toHaveText(['Base', 'Pro'])
    await expect(panel.locator('.chat-tool')).toContainText('Modifie la maquette')
    // Ancien historique, sans le détail : la ligne ne se déplie pas.
    await expect(panel.locator('.chat-tool').first()).not.toHaveAttribute('role', 'button')

    // Texte qui arrive, curseur pendant que Claude travaille.
    await emit(app, { type: 'busy', busy: true })
    await emit(app, { type: 'delta', id: 'a2', text: 'Je regarde' })
    await emit(app, { type: 'delta', id: 'a2', text: ' le cadre.' })
    await expect(panel.locator('.chat-assistant').last()).toHaveText('Je regarde le cadre.')
    await expect(panel.locator('.chat-caret')).toHaveCount(1)

    // Autorisation : le clic part au principal, la carte se tranche quand l'élément revient.
    await emit(app, { type: 'item', item: { kind: 'permission', id: 'p1', requestId: 'req-7', tool: 'Bash', summary: 'npm run build', status: 'asking' } })
    const card = panel.locator('.chat-permission')
    await expect(card).toContainText('Claude veut utiliser Bash')
    await expect(card.locator('pre')).toHaveText('npm run build')
    await card.getByRole('button', { name: 'Autoriser' }).click()
    await expect.poll(() => calls(app)).toContainEqual(['chat:permission', 'req-7', 'allow'])
    await emit(app, { type: 'item', item: { kind: 'permission', id: 'p1', requestId: 'req-7', tool: 'Bash', summary: 'npm run build', status: 'allowed' } })
    await expect(card).toHaveCount(0)
    await expect(panel.getByText('Autorisé : Lance une commande')).toBeVisible()

    // Stop.
    await panel.getByRole('button', { name: 'Arrêter' }).click()
    await expect.poll(() => calls(app)).toContainEqual(['chat:stop'])
    await emit(app, { type: 'busy', busy: false })
    await expect(panel.getByRole('button', { name: 'Envoyer' })).toBeVisible()
    await expect(panel.locator('.chat-caret')).toHaveCount(0)

    // Ctrl+L depuis la saisie referme le panneau.
    await page.getByRole('textbox', { name: 'Message à Claude' }).focus()
    await page.keyboard.press('Control+l')
    await expect(panel).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('taper dans le chat ne touche pas au document ; Entrée envoie avec la sélection', async () => {
  const { app, page } = await launch([scene])
  try {
    await expect(page.locator(node('rBleu1'))).toBeVisible()
    await fakeChat(app, [])
    await reopen(page)
    await page.getByRole('tab', { name: 'Claude' }).click()
    const panel = page.getByTestId('chat-panel')
    await expect(panel.getByText('Demande à Claude de dessiner')).toBeVisible()

    await select(page, ['rBleu1'])
    await expect(panel.getByTestId('chat-selection')).toHaveText('rBleu1')
    const before = await nodeCount(page)
    const box = page.getByRole('textbox', { name: 'Message à Claude' })
    await box.click()
    await page.keyboard.type('a')
    await page.keyboard.press('Delete')
    await page.keyboard.press('Control+z')
    await page.keyboard.press('r')
    await expect(page.locator(node('rBleu1'))).toBeVisible()
    expect(await nodeCount(page)).toBe(before)
    expect(await page.evaluate(() => (window as unknown as { __maquetteUi: { getState(): { tool: string } } }).__maquetteUi.getState().tool)).toBe('move')

    await box.fill('Rends ce bloc plus grand')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('merci')
    await page.keyboard.press('Enter')
    await expect.poll(() => calls(app)).toContainEqual([
      'chat:send',
      { text: 'Rends ce bloc plus grand\nmerci', context: 'Sélection dans Maquette : rBleu1 (shape rectangle, « rBleu1 »)', images: [] },
    ])
    await expect(box).toHaveValue('')

    // Sélection retirée de ce message : rien n'est joint.
    await panel.getByRole('button', { name: 'Ne pas joindre la sélection' }).click()
    await box.fill('Sans contexte')
    await page.keyboard.press('Enter')
    await expect.poll(() => calls(app)).toContainEqual(['chat:send', { text: 'Sans contexte', context: '', images: [] }])
  } finally {
    await app.close()
  }
})

test('coller une image dans la saisie : vignette, et rien sur le canevas', async () => {
  const { app, page } = await launch([scene])
  try {
    await expect(page.locator(node('rBleu1'))).toBeVisible()
    await fakeChat(app, [])
    await page.keyboard.press('Control+l')
    const panel = page.getByTestId('chat-panel')
    await expect(panel).toBeVisible()
    // Collage simulé dans la page : le presse-papiers de l'utilisateur n'est jamais touché.
    const before = await nodeCount(page)
    const box = page.getByRole('textbox', { name: 'Message à Claude' })
    await box.focus()
    await box.evaluate(async (el) => {
      const canvas = new OffscreenCanvas(8, 8)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#808080'
      ctx.fillRect(0, 0, 8, 8)
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      const data = new DataTransfer()
      data.items.add(new File([blob], 'capture.png', { type: 'image/png' }))
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await expect(panel.locator('.chat-thumb img')).toHaveCount(1)
    await page.waitForTimeout(300)
    expect(await nodeCount(page)).toBe(before)

    await panel.getByRole('button', { name: 'Retirer l’image 1' }).click()
    await expect(panel.locator('.chat-thumb')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
