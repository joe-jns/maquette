import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { clickOn, settled } from './canvas'
import { launch } from './launch'

/** Calques vecteur, remplissage image, flous, dégradé conique : par opérations, au panneau, à l'export. */

const panel = (page: Page) => page.getByTestId('right-panel')
const storeDoc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: unknown } } }).__maquetteStore.getState().doc)
const dispatch = (page: Page, ops: unknown[]) =>
  page.evaluate((o) => {
    const s = (window as unknown as { __maquetteStore: { getState(): { dispatch(o: unknown[], l: string): { ok: boolean; ids: Record<string, string> } } } }).__maquetteStore
    return s.getState().dispatch(o, 'test')
  }, ops)
const nodeOf = async (page: Page, id: string) => {
  const find = (list: Record<string, unknown>[]): Record<string, unknown> | null => {
    for (const n of list) {
      if (n.id === id) return n
      const inner = Array.isArray(n.children) ? find(n.children as Record<string, unknown>[]) : null
      if (inner) return inner
    }
    return null
  }
  const doc = (await storeDoc(page)) as { pages: { children: Record<string, unknown>[] }[] }
  return find(doc.pages.flatMap((p) => p.children))
}

/** PNG d'une seule couleur (sans dépendance). */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) c = table[(c ^ b) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc(body), body.length + 4)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.alloc(width * 3 + 1)
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** Rendu PNG à 2× d'un élément par la fenêtre d'export : taille et pixels [r,g,b,a] aux points demandés (fractions). */
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

test('vecteur créé par opérations : dessiné, icône des calques, flou et couleur au panneau, annulable', async () => {
  const { app, page } = await launch()
  const pageId = ((await storeDoc(page)) as { pages: { id: string }[] }).pages[0]!.id
  const r = await dispatch(page, [
    { op: 'create', parent: pageId, node: { id: '$v', type: 'vector', name: 'Logo', path: 'M0 0H40V20H0Z', fills: ['#16A34A'], stroke: { color: '#000000', width: 2, align: 'center' }, x: 100, y: 100, width: 200, height: 100 } },
  ])
  expect(r.ok).toBe(true)
  const id = r.ids.$v!
  const el = page.locator(`.canvas [data-node-id="${id}"]`)
  await expect(el).toBeVisible()
  // Tracé étiré dans sa boîte : viewBox du tracé, proportions libres, contour non mis à l'échelle.
  const svg = el.locator('svg')
  await expect(svg).toHaveAttribute('viewBox', '0 0 40 20')
  await expect(svg).toHaveAttribute('preserveAspectRatio', 'none')
  await expect(svg.locator('path').first()).toHaveAttribute('fill', '#16A34A')
  await expect(svg.locator('path[vector-effect="non-scaling-stroke"]')).toHaveAttribute('stroke', '#000000')
  const box = await el.boundingBox()
  const svgBox = await svg.boundingBox()
  expect(Math.round(svgBox!.width)).toBe(Math.round(box!.width))
  expect(Math.round(svgBox!.height)).toBe(Math.round(box!.height))

  // Icône propre dans le panneau des calques.
  const row = page.locator(`[data-layer-id="${id}"]`)
  await expect(row).toContainText('Logo')
  await expect(row.locator('svg.icon path[d="M6 17C8 8 16 16 18 7"]')).toHaveCount(1)

  await settled(page, id)
  await clickOn(page, id)
  const right = panel(page)
  await expect(right.getByRole('img', { name: 'Vector' })).toBeVisible()
  await expect(right.getByRole('heading', { name: 'Effects' })).toBeVisible()
  // Pas d'image en remplissage d'un vecteur.
  await expect(right.getByRole('button', { name: 'Add image fill' })).toHaveCount(0)

  // Flou du calque au panneau.
  const blur = right.getByRole('textbox', { name: 'Layer blur' })
  await blur.fill('6')
  await blur.press('Enter')
  await expect.poll(async () => (await nodeOf(page, id))?.blur).toBe(6)
  expect(await el.evaluate((e) => getComputedStyle(e).filter)).toBe('blur(6px)')

  // Couleur du remplissage au panneau.
  const hex = right.getByRole('textbox', { name: 'Fill 1', exact: true })
  await hex.fill('2563EB')
  await hex.press('Enter')
  await expect.poll(async () => (await nodeOf(page, id))?.fills).toEqual(['#2563EB'])

  // Annuler (hors du champ, sinon c'est l'annulation du texte) : retire la couleur puis le flou.
  await expect(hex).toHaveValue('2563EB')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await nodeOf(page, id))?.blur).toBeUndefined()
  await app.close()
})

test('remplissage image d’un cadre au panneau : fichier choisi, mode, flou d’arrière-plan, dégradé conique', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'maquette-imgfill-'))
  const file = join(dir, 'rouge.png')
  writeFileSync(file, png(40, 20, [220, 20, 20]))
  const { app, page } = await launch()
  const pageId = ((await storeDoc(page)) as { pages: { id: string }[] }).pages[0]!.id
  const r = await dispatch(page, [{ op: 'create', parent: pageId, node: { id: '$f', type: 'frame', name: 'Carte', x: 100, y: 100, width: 300, height: 200, fills: ['#FFFFFF'] } }])
  const id = r.ids.$f!
  await settled(page, id)
  await clickOn(page, id)
  const right = panel(page)

  // Choisir un fichier : le sélecteur natif n'est jamais ouvert, le fichier est posé sur l'entrée cachée.
  await right.locator('input[data-image-picker]').first().setInputFiles(file)
  await expect.poll(async () => ((await nodeOf(page, id))?.fills as unknown[] | undefined)?.length).toBe(2)
  const fill = ((await nodeOf(page, id))!.fills as { type: string; src: string; fit: string }[])[1]!
  expect(fill).toMatchObject({ type: 'image', fit: 'cover' })
  expect(fill.src).toMatch(/^assets\/[0-9a-f]{16}\.png$/)
  const el = page.locator(`.canvas [data-node-id="${id}"]`)
  await expect.poll(() => el.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('masset://doc/assets/')
  expect(await el.evaluate((e) => getComputedStyle(e).backgroundSize)).toContain('cover')
  await expect(right.locator('[data-image-fill]')).toBeVisible()

  // Mode : Stretch.
  await right.getByRole('combobox', { name: 'Image fit' }).click()
  await page.getByRole('option', { name: 'Stretch' }).click()
  await expect.poll(async () => ((await nodeOf(page, id))!.fills as { fit?: string }[])[1]!.fit).toBe('fill')

  // Export : l'image en remplissage est chargée avant la capture (rouge au centre).
  const out = await renderPixels(app, await storeDoc(page), id, [{ fx: 0.5, fy: 0.5 }])
  expect(out!.size).toEqual({ width: 600, height: 400 })
  const [red, green, blue] = out!.pixels[0]!
  expect(red).toBeGreaterThan(200)
  expect(green).toBeLessThan(60)
  expect(blue).toBeLessThan(60)

  // Flou d'arrière-plan.
  const bg = right.getByRole('textbox', { name: 'Background blur' })
  await bg.fill('20')
  await bg.press('Enter')
  await expect.poll(async () => (await nodeOf(page, id))?.backgroundBlur).toBe(20)
  expect(await el.evaluate((e) => getComputedStyle(e).backdropFilter)).toBe('blur(20px)')

  // Le blanc du dessous passe en dégradé, puis en conique.
  await right.getByRole('button', { name: 'Switch to gradient' }).click()
  await right.getByRole('button', { name: 'Conic' }).click()
  await expect.poll(async () => ((await nodeOf(page, id))!.fills as { type?: string }[])[0]!.type).toBe('conic')
  await expect.poll(() => el.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('conic-gradient')
  await app.close()
})

test('export PNG d’un vecteur : forme étirée, contour intérieur à l’échelle de l’export, dégradé masqué au tracé', async () => {
  const { app, page } = await launch()
  const pageId = ((await storeDoc(page)) as { pages: { id: string }[] }).pages[0]!.id
  const r = await dispatch(page, [
    // Triangle pointe en haut, étiré sur 200 × 100 ; contour intérieur de 10 px.
    { op: 'create', parent: pageId, node: { id: '$t', type: 'vector', path: 'M50 0L100 100H0Z', fills: ['#FF0000'], x: 0, y: 0, width: 200, height: 100 } },
    { op: 'create', parent: pageId, node: { id: '$s', type: 'vector', path: 'M0 0H10V10H0Z', fills: [], stroke: { color: '#0000FF', width: 10, align: 'inside' }, x: 300, y: 0, width: 100, height: 100 } },
    { op: 'create', parent: pageId, node: { id: '$g', type: 'vector', path: 'M50 0L100 100H0Z', fills: ['linear-gradient(90deg, #00FF00, #00FF00)'], x: 500, y: 0, width: 100, height: 100 } },
  ])
  expect(r.ok).toBe(true)
  const doc = await storeDoc(page)
  const tri = await renderPixels(app, doc, r.ids.$t!, [{ fx: 0.5, fy: 0.9 }, { fx: 0.05, fy: 0.1 }])
  expect(tri!.size).toEqual({ width: 400, height: 200 })
  expect(tri!.pixels[0]).toEqual([255, 0, 0, 255])
  expect(tri!.pixels[1]![3]).toBe(0)

  // Contour de 10 px à 2× = 20 px de bord : bleu à 15 px, transparent au centre.
  const sq = await renderPixels(app, doc, r.ids.$s!, [{ fx: 0.075, fy: 0.5 }, { fx: 0.5, fy: 0.5 }])
  expect(sq!.pixels[0]![2]).toBeGreaterThan(200)
  expect(sq!.pixels[0]![3]).toBeGreaterThan(200)
  expect(sq!.pixels[1]![3]).toBe(0)

  const grad = await renderPixels(app, doc, r.ids.$g!, [{ fx: 0.5, fy: 0.9 }, { fx: 0.05, fy: 0.1 }])
  expect(grad!.pixels[0]![1]).toBeGreaterThan(200)
  expect(grad!.pixels[1]![3]).toBe(0)
  await app.close()
})
