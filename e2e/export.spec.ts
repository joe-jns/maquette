import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boxOf, scene, settled } from './canvas'
import { launch } from './launch'

const PNG_RED_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='

interface Rendered { width: number; height: number; size: { width: number; height: number }; pixel: number[] | null }

/** Document de la fenêtre (via le store exposé en e2e). */
const currentDoc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: unknown } } }).__maquetteStore.getState().doc)

/**
 * Rend un élément dans le principal ; renvoie la taille annoncée, la taille lue dans l'image, et
 * la couleur [r, g, b, a] du pixel demandé (fraction de la largeur et de la hauteur).
 */
async function render(
  app: ElectronApplication,
  doc: unknown,
  nodeId: string,
  opts: { scale: number; format: 'png' | 'jpeg'; maxWidth?: number },
  at: { fx: number; fy: number } | null = null,
): Promise<Rendered | null> {
  return app.evaluate(async ({ nativeImage }, { doc, nodeId, opts, at }) => {
    type Fn = (d: unknown, id: string, o: typeof opts) => Promise<{ buffer: Buffer; width: number; height: number } | null>
    const r = await (globalThis as unknown as { __maquetteRenderNode: Fn }).__maquetteRenderNode(doc, nodeId, opts)
    if (!r) return null
    const image = nativeImage.createFromBuffer(r.buffer)
    const size = image.getSize()
    let pixel: number[] | null = null
    if (at) {
      const x = Math.floor(size.width * at.fx)
      const y = Math.floor(size.height * at.fy)
      const bitmap = image.toBitmap() // BGRA
      const i = (y * size.width + x) * 4
      pixel = [bitmap[i + 2]!, bitmap[i + 1]!, bitmap[i]!, bitmap[i + 3]!]
    }
    return { width: r.width, height: r.height, size, pixel }
  }, { doc, nodeId, opts, at })
}

test('rend un cadre en PNG à 2× : taille exacte et texte dessiné', async () => {
  const { app, page } = await launch([scene])
  await settled(page, 'fHero1')
  const zoom = await page.evaluate(() => (window as unknown as { __maquetteUi: { getState(): { camera: { zoom: number } } } }).__maquetteUi.getState().camera.zoom)
  const shown = await boxOf(page, 'fHero1')
  const height = shown.height / zoom
  const doc = await currentDoc(page)

  const title = await boxOf(page, 'tTitre')
  // Centre du titre, en fraction du cadre.
  const at = { fx: (title.x + title.width / 2 - shown.x) / shown.width, fy: (title.y + title.height / 2 - shown.y) / shown.height }
  const r = await render(app, doc, 'fHero1', { scale: 2, format: 'png' })
  expect(r).not.toBeNull()
  expect(r!.size).toEqual({ width: r!.width, height: r!.height })
  expect(r!.width).toBe(1200)
  expect(Math.abs(r!.height - 2 * height)).toBeLessThanOrEqual(1)

  // Le centre exact peut tomber entre deux lettres : on compte les pixels sombres sur la ligne du titre.

  const darkOnTitleLine = await app.evaluate(async ({ nativeImage }, { doc, fy, fx0, fx1 }) => {
    type Fn = (d: unknown, id: string, o: { scale: number; format: 'png' }) => Promise<{ buffer: Buffer } | null>
    const r = await (globalThis as unknown as { __maquetteRenderNode: Fn }).__maquetteRenderNode(doc, 'fHero1', { scale: 2, format: 'png' })
    const image = nativeImage.createFromBuffer(r!.buffer)
    const { width, height } = image.getSize()
    const bitmap = image.toBitmap()
    const y = Math.floor(height * fy)
    let dark = 0
    for (let x = Math.floor(width * fx0); x < Math.floor(width * fx1); x++) {
      const i = (y * width + x) * 4
      if (bitmap[i]! < 100 && bitmap[i + 1]! < 100 && bitmap[i + 2]! < 100) dark++
    }
    return dark
  }, { doc, fy: at.fy, fx0: (title.x - shown.x) / shown.width, fx1: (title.x + title.width - shown.x) / shown.width })
  expect(darkOnTitleLine).toBeGreaterThan(10)

  // Un enfant d'une mise en page automatique : rendu seul, à sa taille affichée.
  const t = await render(app, doc, 'tTitre', { scale: 1, format: 'png' })
  expect(Math.abs(t!.width - title.width / zoom)).toBeLessThanOrEqual(1)
  expect(Math.abs(t!.height - title.height / zoom)).toBeLessThanOrEqual(1)

  // L'échelle de l'export ne touche pas la fenêtre de l'éditeur.
  const after = await boxOf(page, 'fHero1')
  expect(after.width).toBeCloseTo(shown.width, 0)
  await app.close()
})

test('rend une image du dossier assets, en PNG puis en JPEG réduit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'export é '))
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'assets', 'rouge.png'), Buffer.from(PNG_RED_1x1, 'base64'))
  const doc = {
    format: 'maquette', version: 1, styles: { colors: [], text: [] },
    pages: [{
      id: 'pImage', name: 'Images', children: [{
        id: 'iRouge', type: 'image', name: 'Rouge', visible: true, locked: false, opacity: 1,
        width: 120, height: 80, x: 10, y: 10, position: 'flow', src: 'assets/rouge.png', fit: 'cover', radius: 0, shadows: [],
      }, {
        id: 'rCache', type: 'shape', name: 'Caché', visible: false, locked: false, opacity: 1,
        width: 50, height: 50, x: 200, y: 10, position: 'flow', shape: 'rectangle', fills: ['#000000'], radius: 0, shadows: [],
      }],
    }],
  }
  const file = join(dir, 'image.maquette')
  await writeFile(file, JSON.stringify(doc), 'utf8')
  const { app, page } = await launch([file])
  await expect(page.locator('img[data-node-id="iRouge"]')).toBeVisible()
  const loaded = await currentDoc(page)

  const r = await render(app, loaded, 'iRouge', { scale: 2, format: 'png' }, { fx: 0.5, fy: 0.5 })
  expect(r).not.toBeNull()
  expect(r!.size).toEqual({ width: 240, height: 160 })
  const [red, green, blue, alpha] = r!.pixel!
  expect(red).toBeGreaterThan(240)
  expect(green).toBeLessThan(15)
  expect(blue).toBeLessThan(15)
  expect(alpha).toBe(255)

  const small = await render(app, loaded, 'iRouge', { scale: 3, format: 'jpeg', maxWidth: 100 })
  expect(small).not.toBeNull()
  expect(small!.size.width).toBeLessThanOrEqual(100)
  expect(small!.size.width).toBe(small!.width)

  // Élément masqué ou inconnu : pas d'image.
  expect(await render(app, loaded, 'rCache', { scale: 1, format: 'png' })).toBeNull()
  expect(await render(app, loaded, 'inconnu', { scale: 1, format: 'png' })).toBeNull()
  await app.close()
})

