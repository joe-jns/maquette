import { describe, it, expect } from 'vitest'
import { nodeCss } from '../../src/core/css'
import { createNode } from '../../src/core/defaults'
import { parseDocument, serializeDocument } from '../../src/core/format'
import { applyOps } from '../../src/core/ops'
import { repairDocument } from '../../src/core/repair'
import { validateDocument } from '../../src/core/rules'
import type { DocStyles, MaquetteDocument, VectorNode } from '../../src/core/types'
import { isValidPath, pathBounds } from '../../src/core/vector'
import { layerRows } from '../../src/renderer/panels/layerRows'
import { docWith, frame } from './helpers'

const styles: DocStyles = { colors: [{ id: 'c00001', name: 'accent', value: '#C2410C' }], text: [] }
const vector = (id: string, props: Partial<Omit<VectorNode, 'id' | 'type'>> = {}) => createNode({ type: 'vector', x: 0, y: 0, ...props }, id) as VectorNode

describe('tracés SVG', () => {
  it('lisibles : commandes absolues et relatives, nombres collés, exposants', () => {
    expect(isValidPath('M0 0L10 10Z')).toBe(true)
    expect(isValidPath('m1.5-2.5l10,0 0,10z M20 20 h5v5H20z')).toBe(true)
    expect(isValidPath('M0 0C1e1 0 10 10 10 10A5 5 0 0 1 20 20')).toBe(true)
  })

  it('illisibles : sans M au début, paramètres manquants, caractères inconnus', () => {
    expect(isValidPath('')).toBe(false)
    expect(isValidPath('L0 0')).toBe(false)
    expect(isValidPath('M0')).toBe(false)
    expect(isValidPath('M0 0 L1 2 3')).toBe(false)
    expect(isValidPath('M0 0 X1 1')).toBe(false)
    expect(isValidPath('M0 0"/><script>')).toBe(false)
    expect(isValidPath('M0 0 Z 1')).toBe(false)
  })

  it('boîte englobante : lignes, relatif, courbes (points de contrôle), arcs, épaisseur minimale', () => {
    expect(pathBounds('M10 20L30 60')).toEqual([10, 20, 20, 40])
    expect(pathBounds('m10 20 l20 0 0 40 h-30 v-50z')).toEqual([0, 10, 30, 50])
    expect(pathBounds('M0 0C0 -10 20 -10 20 0')).toEqual([0, -10, 20, 10])
    expect(pathBounds('M0 0A10 10 0 0 1 20 0')).toEqual([0, -20, 20, 40])
    expect(pathBounds('M0 5H40')).toEqual([0, 5, 40, 1])
    expect(pathBounds('M0 0 Q')).toBeNull()
  })
})

describe('calque vecteur', () => {
  it('défauts : triangle gris dans un carré de 100', () => {
    expect(vector('v00001')).toMatchObject({
      name: 'Vector', width: 100, height: 100, path: 'M50 0L100 100H0Z', viewBox: [0, 0, 100, 100], fillRule: 'nonzero', fills: ['#D9D9D9'], shadows: [],
    })
    expect(validateDocument(docWith([vector('v00001')]))).toEqual([])
  })

  it('appliquer : viewBox et taille déduites du tracé, couleur CSS lue, dégradé conique permis', () => {
    const doc = docWith([frame('f00001', { x: 0, y: 0 })])
    const r = applyOps(doc, [{ op: 'create', parent: 'f00001', node: { id: '$v', type: 'vector', path: 'M4 4L28 4L16 20Z', fills: ['red'], x: 10, y: 10 } }])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const v = (r.doc.pages[0]!.children[0] as { children: VectorNode[] }).children[0]!
    expect(v).toMatchObject({ viewBox: [4, 4, 24, 16], width: 24, height: 16, fills: ['#FF0000'] })
    // Nouveau tracé sans viewBox : la boîte suit le tracé ; la taille du calque ne change pas.
    const u = applyOps(r.doc, [{ op: 'update', id: v.id, set: { path: 'M0 0H50V50Z', fills: ['conic-gradient(red, blue)'] } }])
    expect(u.ok && (u.doc.pages[0]!.children[0] as { children: VectorNode[] }).children[0]).toMatchObject({ viewBox: [0, 0, 50, 50], width: 24, height: 16 })
  })

  it('appliquer refuse : tracé illisible, image en remplissage, viewBox plate', () => {
    const doc = docWith([vector('v00001')])
    const refuse = (set: Record<string, unknown>) => applyOps(doc, [{ op: 'update', id: 'v00001', set }])
    expect(refuse({ path: 'zut' }).ok).toBe(false)
    const img = refuse({ fills: [{ type: 'image', src: 'a.png', fit: 'cover' }] })
    expect(!img.ok && img.errors[0]!.message).toMatch(/pas d’image/)
    expect(refuse({ viewBox: [0, 0, 0, 10] }).ok).toBe(false)
    expect(applyOps(doc, [{ op: 'create', parent: doc.pages[0]!.id, node: { type: 'vector', path: 'M0 0 Q' } }]).ok).toBe(false)
  })

  it('aller-retour fichier, flous, couleur nommée détachée à la suppression du style', () => {
    const doc = docWith([vector('v00001', { fills: [{ style: 'c00001' }], stroke: { color: '#000000', width: 2, align: 'outside' }, blur: 2, fillRule: 'evenodd' })])
    doc.styles.colors.push(...styles.colors)
    expect(validateDocument(doc)).toEqual([])
    const again = parseDocument(serializeDocument(doc))
    expect(again.ok && again.doc).toEqual(doc)
    const del = applyOps(doc, [{ op: 'style.delete', id: 'c00001' }])
    expect(del.ok && (del.doc.pages[0]!.children[0] as VectorNode).fills).toEqual(['#C2410C'])
  })

  it('réparation : tracé illisible → rectangle, viewBox absente → boîte du tracé, image retirée, fillRule inconnue', () => {
    const raw = JSON.parse(serializeDocument(docWith([vector('v00001'), vector('v00002')]))) as { pages: { children: Record<string, unknown>[] }[] }
    const [a, b] = raw.pages[0]!.children as [Record<string, unknown>, Record<string, unknown>]
    a.path = 'n’importe quoi'
    a.viewBox = [0, 0, 20, 10]
    delete b.viewBox
    b.path = 'M10 10H30V40Z'
    b.fills = ['#000000', { type: 'image', src: 'a.png', fit: 'cover' }]
    b.fillRule = 'odd'
    const { doc, warnings } = repairDocument(raw as unknown as Record<string, unknown>)
    const [va, vb] = (doc as MaquetteDocument).pages[0]!.children as [VectorNode, VectorNode]
    expect(va).toMatchObject({ path: 'M0 0h20v10h-20Z', viewBox: [0, 0, 20, 10] })
    expect(vb).toMatchObject({ viewBox: [10, 10, 20, 30], fills: ['#000000'], fillRule: 'nonzero' })
    expect(warnings.map((w) => w.path)).toEqual(['pages[0].children[0].path', 'pages[0].children[1].fillRule', 'pages[0].children[1].fills[1]'])
    expect(validateDocument(doc as MaquetteDocument)).toEqual([])
  })

  it('rendu de la boîte : ombres en drop-shadow (sans ombre intérieure), puis le flou', () => {
    const css = nodeCss(vector('v00001', {
      shadows: [{ x: 0, y: 4, blur: 8, spread: 2, color: { style: 'c00001' }, inset: false }, { x: 1, y: 1, blur: 1, spread: 0, color: '#000000', inset: true }],
      blur: 3,
    }), null, styles)
    expect(css).toMatchObject({ filter: 'drop-shadow(0px 4px 8px #C2410C) blur(3px)', display: 'block', width: '100px' })
    expect(css.boxShadow).toBeUndefined()
    expect(css.backgroundColor).toBeUndefined()
  })

  it('panneau des calques : icône propre', () => {
    const doc = docWith([vector('v00001')])
    expect(layerRows(doc.pages[0]!, new Set())[0]).toMatchObject({ type: 'vector', icon: 'vector' })
  })
})
