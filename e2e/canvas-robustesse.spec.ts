import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'
import { centerOf, clickOn, docNode, handleCenter, pageChildren, scene, screenOf, settled, uiState } from './canvas'

test('lâcher un fichier qui n’est pas une image ne fait pas quitter le document', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
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
  await clickOn(page, 'rBleu1')
  const e = await handleCenter(page, 'e')
  await page.mouse.dblclick(e.x, e.y)
  expect(await docNode(page, 'rBleu1')).toMatchObject({ width: 100 })
  expect(errors).toEqual([])
  await app.close()
})
