import { test, expect, type Page } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'
import { centerOf, docNode, scene, selection, settled } from './canvas'

const tooltip = (page: Page) => page.getByRole('tooltip')
const menu = (page: Page, name: string) => page.getByRole('menu', { name })
const item = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true })
const tool = (page: Page, name: string) => page.locator(`[data-tool-button="${name}"]`)

async function rightClickOn(page: Page, id: string) {
  const c = await centerOf(page, id)
  await page.mouse.click(c.x, c.y, { button: 'right' })
}

test('infobulle d’outil : après 500 ms, avec le raccourci, au-dessus ; puis instantanée d’un outil à l’autre', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')

  // Le nom accessible reste celui du bouton, l'infobulle s'y ajoute.
  await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toHaveAttribute('data-shortcut', 'R')
  await expect(page.locator('[title]')).toHaveCount(0)

  const start = Date.now()
  await tool(page, 'rect').hover()
  await page.waitForTimeout(250)
  await expect(tooltip(page)).toHaveCount(0)
  await expect(tooltip(page)).toBeVisible()
  expect(Date.now() - start).toBeGreaterThanOrEqual(450)
  await expect(tooltip(page).locator('.tooltip-label')).toHaveText('Rectangle')
  await expect(tooltip(page).locator('.tooltip-shortcut')).toHaveText('R')

  // Style Figma : #1E1E1E, 11 px blanc, rayon 5 ; au-dessus de la barre du bas, à 6 px.
  const style = await tooltip(page).evaluate((el) => {
    const s = getComputedStyle(el)
    return { bg: s.backgroundColor, color: s.color, size: s.fontSize, line: s.lineHeight, pad: s.padding }
  })
  expect(style).toEqual({ bg: 'rgb(30, 30, 30)', color: 'rgb(255, 255, 255)', size: '11px', line: '16px', pad: '4px 8px' })
  const shortcutColor = await tooltip(page).locator('.tooltip-shortcut').evaluate((el) => getComputedStyle(el).color)
  expect(shortcutColor).toBe('rgba(255, 255, 255, 0.6)')
  const tip = (await tooltip(page).boundingBox())!
  const button = (await tool(page, 'rect').boundingBox())!
  expect(Math.round(button.y - (tip.y + tip.height))).toBe(6)
  expect(Math.abs(tip.x + tip.width / 2 - (button.x + button.width / 2))).toBeLessThanOrEqual(1)

  // D'un outil à l'autre : aussitôt.
  await tool(page, 'frame').hover()
  await expect(tooltip(page).locator('.tooltip-label')).toHaveText('Cadre', { timeout: 150 })
  await expect(tooltip(page).locator('.tooltip-shortcut')).toHaveText('F')

  // Échap et le clic la cachent ; elle ne revient pas tant qu'on reste sur le bouton.
  await page.keyboard.press('Escape')
  await expect(tooltip(page)).toHaveCount(0)
  await tool(page, 'text').hover()
  await expect(tooltip(page)).toBeVisible()
  await tool(page, 'text').click()
  await expect(tooltip(page)).toHaveCount(0)
  await page.waitForTimeout(700)
  await expect(tooltip(page)).toHaveCount(0)

  // Dans un panneau : dessous par défaut.
  await page.getByRole('button', { name: 'Ajouter une page' }).hover()
  await expect(tooltip(page)).toHaveText('Ajouter une page')
  const add = (await page.getByRole('button', { name: 'Ajouter une page' }).boundingBox())!
  expect(Math.round((await tooltip(page).boundingBox())!.y - (add.y + add.height))).toBe(6)
  await app.close()
})

test('menu contextuel du canevas : raccourcis, séparateurs, sous-menu Export, style Figma', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await rightClickOn(page, 'rBleu1')
  const m = menu(page, 'Canevas')
  await expect(m).toBeVisible()
  expect(await selection(page)).toEqual(['rBleu1'])

  const shortcut = (name: string) => item(page, name).locator('.menu-shortcut')
  await expect(shortcut('Copier')).toHaveText('Ctrl+C')
  await expect(shortcut('Dupliquer')).toHaveText('Ctrl+D')
  await expect(shortcut('Mettre au premier plan')).toHaveText('Ctrl+Maj+]')
  await expect(shortcut('Mettre dans un cadre')).toHaveText('Ctrl+Alt+G')
  await expect(shortcut('Supprimer')).toHaveText('Suppr')
  await expect(item(page, 'Dupliquer')).toHaveAttribute('aria-keyshortcuts', 'Control+D')
  await expect(m.locator(':scope > [role="separator"]')).toHaveCount(5)
  // Un rectangle n'est pas un cadre : pas de contrôle taste-skill.
  await expect(item(page, 'Vérifier avec taste-skill')).toHaveCount(0)

  const style = await m.evaluate((el) => {
    const s = getComputedStyle(el)
    return { bg: s.backgroundColor, radius: s.borderRadius, border: s.borderTopColor, pad: s.paddingTop }
  })
  expect(style).toEqual({ bg: 'rgb(30, 30, 30)', radius: '13px', border: 'rgb(56, 56, 56)', pad: '8px' })
  expect((await item(page, 'Copier').boundingBox())!.height).toBe(24)
  const shortcutRight = await item(page, 'Copier').evaluate((row) => {
    const r = row.getBoundingClientRect()
    const k = row.querySelector('.menu-shortcut')!.getBoundingClientRect()
    return Math.round(r.right - k.right)
  })
  expect(shortcutRight).toBe(8) // aligné à droite, dans la marge de la rangée

  // Sous-menu au survol, à droite du menu.
  await item(page, 'Exporter en PNG').hover()
  const sub = menu(page, 'Exporter en PNG')
  await expect(sub).toBeVisible()
  await expect(item(page, 'Exporter en PNG')).toHaveAttribute('aria-expanded', 'true')
  await expect(sub.getByRole('menuitem')).toHaveText(['1×', '2×Ctrl+Maj+E', '3×'])
  expect((await sub.boundingBox())!.x).toBeGreaterThan((await m.boundingBox())!.x + (await m.boundingBox())!.width - 4)
  // Survoler une autre rangée le referme.
  await item(page, 'Dupliquer').hover()
  await expect(sub).toHaveCount(0)

  // Clic ailleurs : fermé.
  await page.mouse.click(5, 300)
  await expect(m).toHaveCount(0)

  // Le sous-menu lance le vrai export (même commande que le menu Fichier).
  const target = join(await mkdtemp(join(tmpdir(), 'maquette-menu-')), 'bleu.png')
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as typeof dialog.showSaveDialog
  }, target)
  await rightClickOn(page, 'rBleu1')
  await item(page, 'Exporter en PNG').hover()
  await item(page, '2×').click()
  await expect(menu(page, 'Canevas')).toHaveCount(0)
  await expect.poll(async () => (await readFile(target).catch(() => null))?.length ?? 0).toBeGreaterThan(0)
  const size = await app.evaluate(({ nativeImage }, target) => nativeImage.createFromPath(target).getSize(), target)
  expect(size).toEqual({ width: 200, height: 200 })
  await app.close()
})

test('menu contextuel au clavier : ↑ ↓ sautent les séparateurs, → ← le sous-menu, Entrée, Échap', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await rightClickOn(page, 'rBleu1')
  const m = menu(page, 'Canevas')
  await expect(m).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(item(page, 'Copier')).toBeFocused()
  await expect(item(page, 'Copier')).toHaveClass(/is-active/)
  await page.keyboard.press('ArrowUp')
  await expect(item(page, 'Supprimer')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(item(page, 'Exporter en PNG')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(item(page, '1×')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(item(page, '2×')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(menu(page, 'Exporter en PNG')).toHaveCount(0)
  await expect(item(page, 'Exporter en PNG')).toBeFocused()

  // Échap ferme le menu sans toucher au canevas (qui remonterait au parent).
  await page.keyboard.press('Escape')
  await expect(m).toHaveCount(0)
  expect(await selection(page)).toEqual(['rBleu1'])

  // Entrée lance la rangée active : Dupliquer.
  await rightClickOn(page, 'rBleu1')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
  await expect(item(page, 'Dupliquer')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu(page, 'Canevas')).toHaveCount(0)
  const [copy] = await selection(page)
  expect(copy).not.toBe('rBleu1')
  expect(await docNode(page, copy!)).not.toBeNull()
  await app.close()
})

test('menu contextuel des calques et du vide', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.locator('[data-layer-id="rVert1"]').click({ button: 'right' })
  await expect(menu(page, 'Calque')).toBeVisible()
  expect(await selection(page)).toEqual(['rVert1'])
  await expect(item(page, 'Renommer')).toBeVisible()
  await expect(item(page, 'Coller')).toBeVisible()
  await item(page, 'Masquer').click()
  expect(await docNode(page, 'rVert1')).toMatchObject({ visible: false })
  await page.locator('[data-layer-id="rVert1"]').click({ button: 'right' })
  await item(page, 'Afficher').click()
  expect(await docNode(page, 'rVert1')).toMatchObject({ visible: true })

  await page.locator('[data-layer-id="rVert1"]').click({ button: 'right' })
  await item(page, 'Renommer').click()
  await expect(page.getByRole('textbox', { name: 'Nouveau nom' })).toBeFocused()
  await page.keyboard.press('Escape')

  // Dans le vide : la sélection se vide, menu du canevas.
  const canvas = (await page.getByTestId('canvas').boundingBox())!
  await page.mouse.click(canvas.x + canvas.width - 40, canvas.y + 40, { button: 'right' })
  expect(await selection(page)).toEqual([])
  await expect(item(page, 'Coller ici')).toBeVisible()
  await expect(item(page, 'Tout sélectionner').locator('.menu-shortcut')).toHaveText('Ctrl+A')
  await item(page, 'Tout sélectionner').click()
  expect((await selection(page)).length).toBe(4)
  await app.close()
})
