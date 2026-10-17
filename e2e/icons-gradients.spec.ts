import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { clickOn, docNode, scene, settled, uiState } from './canvas'
import { launch } from './launch'

/** Icônes Lucide et dégradés : par Claude (MCP), à la main (sélecteur, panneau), à l'export. */

const panel = (page: Page) => page.getByTestId('right-panel')
const storeDoc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: unknown } } }).__maquetteStore.getState().doc)
const dispatch = (page: Page, ops: unknown[]) =>
  page.evaluate((o) => {
    const s = (window as unknown as { __maquetteStore: { getState(): { dispatch(o: unknown[], l: string): { ok: boolean; ids: Record<string, string> } } } }).__maquetteStore
    return s.getState().dispatch(o, 'test')
  }, ops)

test('Claude crée une icône et un dégradé via appliquer : visibles, bonne couleur, annulables', async () => {
  const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\maquette-e2e-icons-${process.pid}` : join(tmpdir(), `maquette-e2e-icons-${process.pid}.sock`)
  const env = { MAQUETTE_PIPE: pipe, MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-icons-')) }
  const { app, page } = await launch([], env)
  await expect(page.getByTestId('canvas')).toBeVisible()
  const exe = await app.evaluate(() => process.execPath)
  const c = new Client({ name: 'e2e', version: '1.0.0' })
  await c.connect(new StdioClientTransport({
    command: exe,
    args: [resolve('out/main/relay.js')],
    env: { ...(process.env as Record<string, string>), ...env, ELECTRON_RUN_AS_NODE: '1' },
  }))
  const text = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as { type: string; text?: string }[]).find((x) => x.type === 'text')?.text ?? ''
  try {
    const noms = JSON.parse(text(await c.callTool({ name: 'icones', arguments: { cherche: 'panier', limite: 5 } }))).noms as string[]
    expect(noms).toContain('shopping-cart')

    const lu = JSON.parse(text(await c.callTool({ name: 'lire_document', arguments: {} })))
    const r = await c.callTool({
      name: 'appliquer',
      arguments: {
        libelle: 'carte',
        operations: [
          { op: 'create', parent: lu.pages[0].id, node: { id: '$f', type: 'frame', name: 'Carte', x: 40, y: 40, width: 240, height: 120, fills: ['linear-gradient(90deg, #FF0000, #0000FF)'] } },
          { op: 'create', parent: '$f', node: { id: '$i', type: 'icon', icon: 'ShoppingCart', color: '#16A34A', size: 48, x: 96, y: 36 } },
        ],
      },
    })
    expect(r.isError, text(r)).toBeFalsy()
    const ids = JSON.parse(text(r)).ids as Record<string, string>
    const icon = page.locator(`.canvas [data-node-id="${ids.$i}"]`)
    await expect(icon).toBeVisible()
    await expect(icon).toHaveAttribute('data-icon-name', 'shopping-cart')
    await expect(icon.locator('svg path, svg circle').first()).toBeAttached()
    expect(await icon.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(22, 163, 74)')
    expect(await icon.locator('svg').evaluate((el) => getComputedStyle(el).stroke)).toBe('rgb(22, 163, 74)')
    const frame = page.locator(`.canvas [data-node-id="${ids.$f}"]`)
    expect(await frame.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)')

    // Une seule annulation retire tout le lot.
    await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+z')
    await expect(frame).toHaveCount(0)
    await expect(icon).toHaveCount(0)
  } finally {
    await c.close()
    await app.close()
  }
})

test('insertion à la main : Maj+I ouvre le sélecteur, recherche en français, l’icône se pose et se change au panneau', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'fLibre')
  await clickOn(page, 'fLibre')
  await page.keyboard.press('Shift+I')
  const picker = page.getByRole('dialog', { name: 'Insérer une icône' })
  await expect(picker).toBeVisible()
  // Grille virtualisée : quelques dizaines de boutons dessinés, pas les ~1 900.
  expect(await picker.getByRole('option').count()).toBeLessThan(150)
  await picker.getByRole('searchbox', { name: 'Rechercher une icône' }).fill('panier')
  await expect(picker.getByRole('option', { name: 'shopping-cart', exact: true })).toBeVisible()
  await picker.getByRole('option', { name: 'shopping-cart', exact: true }).click()
  await expect(picker).toHaveCount(0)

  const { selection } = await uiState(page)
  expect(selection).toHaveLength(1)
  const id = selection[0]!
  expect(await docNode(page, id)).toMatchObject({ type: 'icon', icon: 'shopping-cart', width: 24, height: 24 })
  const parent = (await docNode(page, 'fLibre')) as unknown as { children: { id: string }[] }
  expect(parent.children.map((c) => c.id)).toContain(id)

  // Panneau : section Icône, changer d'icône par la recherche, puis le trait.
  await expect(panel(page).getByRole('region', { name: 'Icône' })).toBeVisible()
  await expect(panel(page).getByRole('region', { name: 'Contour' })).toHaveCount(0)
  await panel(page).getByRole('button', { name: 'Icône', exact: true }).click()
  const inPanel = panel(page).getByRole('dialog', { name: 'Choisir une icône' })
  await inPanel.getByRole('searchbox').fill('check')
  await inPanel.getByRole('searchbox').press('Enter')
  expect(await docNode(page, id)).toMatchObject({ icon: 'check', name: 'check' })
  const stroke = panel(page).getByRole('textbox', { name: 'Épaisseur du trait de l’icône' })
  await stroke.click()
  await stroke.press('Control+a')
  await stroke.type('1.5')
  await stroke.press('Enter')
  expect(await docNode(page, id)).toMatchObject({ strokeWidth: 1.5 })

  // Échap ferme le sélecteur sans désélectionner ; Ctrl+Z défait le trait puis l'icône.
  await clickOn(page, id)
  await page.keyboard.press('Shift+I')
  await expect(page.getByRole('dialog', { name: 'Insérer une icône' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Insérer une icône' })).toHaveCount(0)
  expect((await uiState(page)).selection).toEqual([id])
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+z')
  expect(await docNode(page, id)).toMatchObject({ strokeWidth: 2 })
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  expect(await docNode(page, id)).toBeNull()
  await app.close()
})

test('menu des formes : entrée « Icône… »', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await page.getByRole('button', { name: 'Formes' }).click()
  await page.getByRole('menuitem', { name: /Icône/ }).click()
  await expect(page.getByRole('dialog', { name: 'Insérer une icône' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Rechercher une icône' }).fill('étoile')
  await page.getByRole('searchbox', { name: 'Rechercher une icône' }).press('Enter')
  const id = (await uiState(page)).selection[0]!
  expect(await docNode(page, id)).toMatchObject({ type: 'icon', icon: 'star' })
  await app.close()
})

test('dégradé au panneau : passer en dégradé, angle, arrêt, retour à l’uni, annulation', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  await clickOn(page, 'rBleu1')
  await panel(page).getByRole('button', { name: 'Passer en dégradé' }).click()
  const fill = async () => ((await docNode(page, 'rBleu1')) as unknown as { fills: unknown[] }).fills
  expect(await fill()).toEqual([{ type: 'linear', angle: 180, stops: [{ color: '#93C5FD', position: 0 }, { color: '#93C5FD00', position: 1 }] }])

  const angle = panel(page).getByRole('textbox', { name: 'Angle du dégradé' })
  await angle.click()
  await angle.press('Control+a')
  await angle.type('45')
  await angle.press('Enter')
  expect(await fill()).toMatchObject([{ angle: 45 }])

  const hex2 = panel(page).getByRole('textbox', { name: 'Arrêt 2', exact: true })
  await hex2.click()
  await hex2.press('Control+a')
  await hex2.type('1d4ed8')
  await hex2.press('Enter')
  expect(await fill()).toMatchObject([{ stops: [{}, { color: '#1D4ED800' }] }])

  await panel(page).getByRole('button', { name: 'Ajouter un arrêt' }).click()
  expect(((await fill())[0] as { stops: unknown[] }).stops).toHaveLength(3)
  await panel(page).getByRole('button', { name: 'Radial' }).click()
  expect(await fill()).toMatchObject([{ type: 'radial' }])
  const el = page.locator('.canvas [data-node-id="rBleu1"]')
  expect(await el.evaluate((e) => getComputedStyle(e).backgroundImage)).toMatch(/^radial-gradient\(/)

  await panel(page).getByRole('button', { name: 'Couleur unie pour le remplissage 1' }).click()
  expect(await fill()).toEqual(['#93C5FD'])
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
  for (let i = 0; i < 6; i++) await page.keyboard.press('Control+z')
  expect(await fill()).toEqual(['#93C5FD'])
  await page.keyboard.press('Control+y')
  expect(await fill()).toMatchObject([{ type: 'linear', angle: 180 }])
  await app.close()
})

/** Rend un élément en PNG dans le principal et lit des pixels (fractions de la largeur et de la hauteur). */
async function renderPixels(app: ElectronApplication, doc: unknown, nodeId: string, points: { fx: number; fy: number }[]) {
  return app.evaluate(async ({ nativeImage }, { doc, nodeId, points }) => {
    type Fn = (d: unknown, id: string, o: { scale: number; format: 'png' }) => Promise<{ buffer: Buffer; width: number; height: number } | null>
    const r = await (globalThis as unknown as { __maquetteRenderNode: Fn }).__maquetteRenderNode(doc, nodeId, { scale: 2, format: 'png' })
    if (!r) return null
    const image = nativeImage.createFromBuffer(r.buffer)
    const size = image.getSize()
    const bitmap = image.toBitmap()
    return {
      size,
      pixels: points.map(({ fx, fy }) => {
        const i = (Math.floor(size.height * fy) * size.width + Math.floor(size.width * fx)) * 4
        return [bitmap[i + 2]!, bitmap[i + 1]!, bitmap[i]!, bitmap[i + 3]!]
      }),
    }
  }, { doc, nodeId, points })
}

test('export PNG d’un cadre avec dégradé et icône : non vide, couleurs aux bons endroits', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'rBleu1')
  const pageId = ((await storeDoc(page)) as { pages: { id: string }[] }).pages[0]!.id
  const r = await dispatch(page, [
    { op: 'create', parent: pageId, node: { id: '$f', type: 'frame', x: 2000, y: 0, width: 200, height: 100, fills: [{ type: 'linear', angle: 90, stops: [{ color: '#FF0000', position: 0 }, { color: '#0000FF', position: 1 }] }] } },
    { op: 'create', parent: '$f', node: { type: 'icon', icon: 'minus', color: '#00FF00', strokeWidth: 4, width: 48, height: 48, x: 76, y: 26 } },
  ])
  expect(r.ok).toBe(true)
  const out = await renderPixels(app, await storeDoc(page), r.ids.$f!, [{ fx: 0.02, fy: 0.1 }, { fx: 0.98, fy: 0.1 }, { fx: 0.5, fy: 0.5 }])
  expect(out).not.toBeNull()
  expect(out!.size).toEqual({ width: 400, height: 200 })
  const [left, right, center] = out!.pixels
  expect(left![0]).toBeGreaterThan(200)
  expect(left![2]).toBeLessThan(60)
  expect(right![2]).toBeGreaterThan(200)
  expect(right![0]).toBeLessThan(60)
  expect(center![1]).toBeGreaterThan(200)
  expect(center![0]).toBeLessThan(60)
  await app.close()
})
