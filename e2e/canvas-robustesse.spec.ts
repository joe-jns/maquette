import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'
import { centerOf, clickOn, docNode, handleCenter, pageChildren, scene, screenOf, settled, uiState, resetCamera } from './canvas'

test('lâcher un fichier qui n’est pas une image ne fait pas quitter le document', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  const url = page.url()
  for (const selector of ['[data-testid="canvas"]', 'body']) {
    await page.evaluate((sel) => {
      const data = new DataTransfer()
      data.items.add(new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' }))
      const target = document.querySelector(sel)!
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }))
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
    }, selector)
  }
  await page.waitForTimeout(300)
  expect(page.url()).toBe(url)
  await expect(page.locator('[data-node-id="rBleu1"]')).toBeVisible()
  const prevented = await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0]!.webContents
    let blocked = false
    wc.emit('will-navigate', { preventDefault() { blocked = true } }, 'file:///C:/notes.pdf')
    return blocked
  })
  expect(prevented).toBe(true)
  await app.close()
})

test('vider un texte puis cliquer sur un autre élément le sélectionne', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  await page.keyboard.press('t')
  const p = await screenOf(page, 100, 420)
  await page.mouse.click(p.x, p.y)
  await page.keyboard.press('Backspace')
  await clickOn(page, 'rBleu1')
  expect((await uiState(page)).selection).toEqual(['rBleu1'])
  expect((await pageChildren(page)).some((n) => n.type === 'text')).toBe(false)
  await app.close()
})

test('fenêtre d’aide ouverte : les raccourcis ne touchent pas au document', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  await clickOn(page, 'rBleu1')
  await page.keyboard.press('Shift+?')
  await expect(page.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeVisible()
  await page.keyboard.press('Delete')
  await page.keyboard.press('Control+d')
  await page.keyboard.press('r')
  expect((await pageChildren(page)).map((n) => n.id)).toEqual(['fHero1', 'rBleu1', 'rVert1', 'fLibre'])
  expect((await uiState(page)).tool).toBe('move')
  await page.keyboard.press('Shift+?')
  await expect(page.getByRole('dialog', { name: 'Raccourcis clavier' })).toHaveCount(0)
  await app.close()
})

test('enregistrer pendant l’édition d’un texte garde ce qui vient d’être tapé', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'édition '))
  const file = join(dir, 'scène.maquette')
  await copyFile(scene, file)
  const { app, page } = await launch([file])
  await settled(page, 'tTitre')
  await resetCamera(page)
  const c = await centerOf(page, 'tTitre')
  await page.mouse.dblclick(c.x, c.y)
  await page.waitForTimeout(350)
  await page.mouse.dblclick(c.x, c.y)
  await expect.poll(async () => (await uiState(page)).editing).toBe('tTitre')
  await page.keyboard.type('Titre tapé')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu', 'save'))
  await expect.poll(async () => readFile(file, 'utf8')).toContain('"content": "Titre tapé"')
  await expect(page).toHaveTitle('scène.maquette — Maquette')
  await app.close()
})

test('double-clic sur le bord d’un rectangle : rien ne se passe, aucune erreur', async () => {
  const { app, page } = await launch([scene])
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await settled(page, 'rBleu1')
  await resetCamera(page)
  await clickOn(page, 'rBleu1')
  const e = await handleCenter(page, 'e')
  await page.mouse.dblclick(e.x, e.y)
  expect(await docNode(page, 'rBleu1')).toMatchObject({ width: 100 })
  expect(errors).toEqual([])
  await app.close()
})

test('après Ctrl+Z, la sélection ne garde pas un élément disparu', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  await page.keyboard.press('r')
  const p = await screenOf(page, 100, 420)
  await page.mouse.click(p.x, p.y)
  expect((await uiState(page)).selection).toHaveLength(1)
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await uiState(page)).selection).toEqual([])
  await app.close()
})

test('déposer deux images : une seule annulation les retire toutes les deux', async () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const dir = await mkdtemp(join(tmpdir(), 'deux images '))
  const file = join(dir, 'scène.maquette')
  await copyFile(scene, file)
  const { app, page } = await launch([file])
  await settled(page, 'rBleu1')
  await resetCamera(page)
  const p = await screenOf(page, 120, 420)
  await page.evaluate(({ b64, x, y }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'a.png', { type: 'image/png' }))
    data.items.add(new File([bytes, new Uint8Array([0])], 'b.png', { type: 'image/png' }))
    const target = document.querySelector('[data-testid="canvas"]')!
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }))
  }, { b64: PNG, x: p.x, y: p.y })
  await expect.poll(async () => (await pageChildren(page)).filter((n) => n.type === 'image').length).toBe(2)
  await page.keyboard.press('Control+z')
  expect((await pageChildren(page)).filter((n) => n.type === 'image')).toHaveLength(0)
  await app.close()
})
