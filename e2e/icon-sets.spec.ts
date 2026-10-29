import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { clickOn, docNode, scene, settled, uiState } from './canvas'
import { launch } from './launch'

/** Jeux d'icônes Phosphor, Feather et Material Rounded : par opérations, au sélecteur, au panneau, à l'export. */

const panel = (page: Page) => page.getByTestId('right-panel')
const currentDoc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: unknown } } }).__maquetteStore.getState().doc)
const dispatch = (page: Page, ops: unknown[]) =>
  page.evaluate((o) => {
    const s = (window as unknown as { __maquetteStore: { getState(): { dispatch(o: unknown[], l: string): { ok: boolean; ids: Record<string, string> } } } }).__maquetteStore
    return s.getState().dispatch(o, 'test')
  }, ops)

/** Le tracé dessiné d'une icône sur le canevas : attributs « d » de ses chemins (vides exclus). */
const drawnPaths = (page: Page, id: string) =>
  page.locator(`.canvas [data-node-id="${id}"] svg path`).evaluateAll((els) => els.map((e) => e.getAttribute('d') ?? '').filter(Boolean))

/** Pixels assez opaques d'un rendu PNG de l'élément. */
const inkedPixels = (app: ElectronApplication, doc: unknown, nodeId: string) =>
  app.evaluate(async ({ nativeImage }, { doc, nodeId }) => {
    type Fn = (d: unknown, id: string, o: { scale: number; format: 'png' }) => Promise<{ buffer: Buffer } | null>
    const r = await (globalThis as unknown as { __maquetteRenderNode: Fn }).__maquetteRenderNode(doc, nodeId, { scale: 2, format: 'png' })
    if (!r) return -1
    const bitmap = nativeImage.createFromBuffer(r.buffer).toBitmap()
    let n = 0
    for (let i = 3; i < bitmap.length; i += 4) if (bitmap[i]! > 128) n++
    return n
  }, { doc, nodeId })

test('par opérations : Phosphor bold, Material Rounded plein, Feather — dessinés à l’écran et à l’export', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'fLibre')
  const r = await dispatch(page, [
    { op: 'create', parent: 'fLibre', node: { id: '$ph', type: 'icon', set: 'phosphor', icon: 'caret-right', weight: 'bold', color: '#C2410C', width: 48, height: 48, x: 10, y: 10 } },
    { op: 'create', parent: 'fLibre', node: { id: '$ma', type: 'icon', set: 'material-rounded', icon: 'grass', filled: true, width: 48, height: 48, x: 70, y: 10 } },
    { op: 'create', parent: 'fLibre', node: { id: '$ma2', type: 'icon', set: 'material-rounded', icon: 'inventory_2', width: 48, height: 48, x: 130, y: 10 } },
    { op: 'create', parent: 'fLibre', node: { id: '$fe', type: 'icon', set: 'feather', icon: 'clock', width: 48, height: 48, x: 190, y: 10 } },
  ])
  expect(r.ok).toBe(true)
  const { $ph, $ma, $ma2, $fe } = r.ids as Record<string, string>

  // Phosphor bold : le tracé du paquet (variante bold), en aplat de la couleur de l'icône.
  await expect.poll(() => drawnPaths(page, $ph!)).toEqual([expect.stringMatching(/^M184\.49,136\.49/)])
  const ph = page.locator(`.canvas [data-node-id="${$ph}"]`)
  await expect(ph).toHaveAttribute('data-icon-set', 'phosphor')
  expect(await ph.locator('svg').evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(194, 65, 12)')
  await expect.poll(async () => (await drawnPaths(page, $ma!)).length).toBe(1)
  await expect.poll(async () => (await drawnPaths(page, $ma2!)).length).toBe(1)
  // Plein et contour : deux tracés différents.
  expect((await drawnPaths(page, $ma!))[0]).not.toBe((await drawnPaths(page, $ma2!))[0])
  // Feather est au trait : un cercle et une ligne brisée.
  await expect(page.locator(`.canvas [data-node-id="${$fe}"] svg circle`)).toHaveCount(1)
  expect(await page.locator(`.canvas [data-node-id="${$fe}"] svg`).evaluate((el) => getComputedStyle(el).stroke)).not.toBe('none')

  // Export PNG : les tracés sont chargés avant la capture.
  const doc = await currentDoc(page)
  for (const id of [$ph!, $ma!, $fe!]) expect(await inkedPixels(app, doc, id)).toBeGreaterThan(100)
  await app.close()
})

test('au sélecteur : jeu Phosphor en bold, puis Material Rounded plein ; variante changée au panneau', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'fLibre')
  await clickOn(page, 'fLibre')
  await page.keyboard.press('Shift+I')
  const picker = page.getByRole('dialog', { name: 'Insert icon' })
  await expect(picker).toBeVisible()
  await picker.getByRole('combobox', { name: 'Icon set' }).click()
  await page.getByRole('listbox', { name: 'Icon set' }).getByRole('option', { name: 'Phosphor' }).click()
  await picker.getByRole('combobox', { name: 'Icon weight' }).click()
  await page.getByRole('listbox', { name: 'Icon weight' }).getByRole('option', { name: 'Bold' }).click()
  await expect(picker).toBeVisible()
  await picker.getByRole('searchbox', { name: 'Search icons' }).fill('quotes')
  const option = picker.getByRole('option', { name: 'quotes', exact: true })
  await expect(option.locator('svg path')).toHaveAttribute('d', /\S/)
  await option.click()
  await expect(picker).toHaveCount(0)
  const ph = (await uiState(page)).selection[0]!
  expect(await docNode(page, ph)).toMatchObject({ type: 'icon', set: 'phosphor', icon: 'quotes', weight: 'bold' })
  await expect.poll(async () => (await drawnPaths(page, ph)).length).toBe(1)

  // Au panneau : variante duotone (deux tracés, le fond à 20 %), pas d'épaisseur de trait.
  await expect(panel(page).getByRole('textbox', { name: 'Icon stroke width' })).toHaveCount(0)
  await panel(page).getByRole('combobox', { name: 'Icon weight' }).click()
  await page.getByRole('listbox', { name: 'Icon weight' }).getByRole('option', { name: 'Duotone' }).click()
  expect(await docNode(page, ph)).toMatchObject({ weight: 'duotone' })
  await expect.poll(async () => (await drawnPaths(page, ph)).length).toBe(2)

  // Le sélecteur rouvre sur le dernier jeu ; Material Rounded plein, recherche, Entrée.
  await clickOn(page, 'fLibre')
  await page.keyboard.press('Shift+I')
  await expect(picker.getByRole('combobox', { name: 'Icon set' })).toHaveText(/Phosphor/)
  await picker.getByRole('combobox', { name: 'Icon set' }).click()
  await page.getByRole('listbox', { name: 'Icon set' }).getByRole('option', { name: 'Material Rounded' }).click()
  await picker.getByRole('button', { name: 'Filled' }).click()
  await picker.getByRole('searchbox', { name: 'Search icons' }).fill('inventory 2')
  await picker.getByRole('searchbox', { name: 'Search icons' }).press('Enter')
  const ma = (await uiState(page)).selection[0]!
  expect(await docNode(page, ma)).toMatchObject({ type: 'icon', set: 'material-rounded', icon: 'inventory_2', filled: true })
  await expect.poll(async () => (await drawnPaths(page, ma)).length).toBe(1)
  const filledPath = (await drawnPaths(page, ma))[0]

  // Au panneau : retour au contour (autre tracé).
  await panel(page).getByRole('group', { name: 'Icon style' }).getByRole('button', { name: 'Outlined' }).click()
  expect((await docNode(page, ma)) as unknown as Record<string, unknown>).not.toHaveProperty('filled')
  await expect.poll(async () => (await drawnPaths(page, ma))[0]).not.toBe(filledPath)
  await app.close()
})
