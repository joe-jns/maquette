import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launch } from './launch'

/**
 * Graisses et italique des polices Google : l'export PNG (et la capture que voit Claude) doit dessiner
 * la graisse demandée, pas la 400 épaissie par le navigateur. Police d'essai en cache, sans réseau :
 * trois fichiers distincts (400, 900, 400 italique) tirés d'Inter variable.
 */

const FAMILY = 'Essai Graisse'
const INTER = resolve('node_modules/@fontsource-variable/inter/files')
const sha16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

let fontsDir: string
test.beforeEach(async () => {
  fontsDir = await mkdtemp(join(tmpdir(), 'maquette-graisses-'))
  await mkdir(join(fontsDir, 'files'), { recursive: true })
  await mkdir(join(fontsDir, 'css'), { recursive: true })
  await copyFile(join(INTER, 'inter-latin-wght-normal.woff2'), join(fontsDir, 'files', 'aaaaaaaaaaaaaaaa.woff2'))
  await copyFile(join(INTER, 'inter-latin-wght-normal.woff2'), join(fontsDir, 'files', 'bbbbbbbbbbbbbbbb.woff2'))
  await copyFile(join(INTER, 'inter-latin-wght-italic.woff2'), join(fontsDir, 'files', 'cccccccccccccccc.woff2'))
  const face = (style: string, weight: number, file: string) =>
    `@font-face { font-family: '${FAMILY}'; font-style: ${style}; font-weight: ${weight}; font-display: swap; src: url(mfont://${file}.woff2) format('woff2'); }`
  await writeFile(
    join(fontsDir, 'css', `${sha16(FAMILY)}.css`),
    [face('normal', 400, 'aaaaaaaaaaaaaaaa'), face('normal', 900, 'bbbbbbbbbbbbbbbb'), face('italic', 400, 'cccccccccccccccc')].join('\n'),
  )
})
test.afterEach(async () => {
  await rm(fontsDir, { recursive: true, force: true })
})

const text = (id: string, y: number, fontWeight: number, fontStyle: string) => ({
  id, type: 'text', name: id, visible: true, locked: false, opacity: 1, width: { mode: 'hug' }, height: { mode: 'hug' }, x: 10, y,
  position: 'flow', content: 'Graisse lourde WWW', fontFamily: FAMILY, fontWeight, fontStyle, fontSize: 40, lineHeight: 48,
  letterSpacing: 0, textAlign: 'left', color: '#111111', textSizing: 'auto',
})

test('export PNG : la graisse 900 et l’italique demandés sont chargés avant la capture', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'maquette-graisses-doc-'))
  const doc = {
    format: 'maquette', version: 1, styles: { colors: [], text: [] },
    pages: [{ id: 'pG', name: 'Graisses', children: [text('tLourd', 10, 900, 'normal'), text('tItal', 100, 400, 'italic')] }],
  }
  const file = join(dir, 'graisses.maquette')
  await writeFile(file, JSON.stringify(doc), 'utf8')
  const { app, page } = await launch([file], { MAQUETTE_FONTS_OFFLINE: '1', MAQUETTE_FONTS_DIR: fontsDir })
  try {
    await expect(page.locator('[data-node-id="tLourd"]')).toBeVisible()
    // Largeurs attendues, mesurées une fois chaque fichier chargé.
    const widths = await page.evaluate(async (family) => {
      const spec = (s: string) => `${s} 40px "${family}"`
      await Promise.all(['normal 400', 'normal 900', 'italic 400'].map((s) => document.fonts.load(spec(s))))
      const ctx = document.createElement('canvas').getContext('2d')!
      const w = (s: string) => {
        ctx.font = spec(s)
        return ctx.measureText('Graisse lourde WWW').width
      }
      return { regular: w('normal 400'), black: w('normal 900'), italic: w('italic 400') }
    }, FAMILY)
    expect(widths.black - widths.regular).toBeGreaterThan(20)

    // Export dans la fenêtre cachée, qui n'a encore chargé aucun fichier de cette police.
    const rendered = await app.evaluate(async (_e, d) => {
      type Fn = (d: unknown, id: string, o: unknown) => Promise<{ width: number; height: number } | null>
      const fn = (globalThis as unknown as { __maquetteRenderNode: Fn }).__maquetteRenderNode
      return [await fn(d, 'tLourd', { scale: 1, format: 'png' }), await fn(d, 'tItal', { scale: 1, format: 'png' })]
    }, doc)
    expect(Math.abs(rendered[0]!.width - widths.black), `900 : ${rendered[0]!.width} au lieu de ${widths.black}`).toBeLessThanOrEqual(2)
    expect(Math.abs(rendered[1]!.width - widths.italic), `italique : ${rendered[1]!.width} au lieu de ${widths.italic}`).toBeLessThanOrEqual(2)
  } finally {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  }
})
