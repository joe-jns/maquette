import { describe, expect, it } from 'vitest'
import { findInInstance } from '../../src/core/components'
import { arcPath, clampStops, penLinear, penRadial } from '../../src/core/pen/geometry'
import { importPen, PenImportError, penImageUrls } from '../../src/core/pen/importPen'
import { migratePen } from '../../src/core/pen/migrate'
import { validateDocument } from '../../src/core/rules'
import { findNode } from '../../src/core/tree'
import type { FrameNode, IconNode, MaquetteDocument, Node, ShapeNode, TextNode, VectorNode } from '../../src/core/types'

/** Document Pen minimal autour de quelques calques. */
const pen = (children: unknown[], extra: Record<string, unknown> = {}) => ({ version: '2.21', children, ...extra })

function run(children: unknown[], extra: Record<string, unknown> = {}, image?: (url: string) => string | null) {
  const r = importPen(pen(children, extra), image ? { image } : {})
  expect(validateDocument(r.doc)).toEqual([])
  return r
}
const top = (doc: MaquetteDocument) => doc.pages[0]!.children
const get = <T extends Node = Node>(doc: MaquetteDocument, id: string) => findNode(doc, id)!.node as T
const labels = (r: { report: { items: { label: string; count: number }[] } }) =>
  Object.fromEntries(r.report.items.map((i) => [i.label, i.count]))

describe('import Pen : entrée', () => {
  it('refuse ce qui n’est pas un .pen, avec un message clair', () => {
    expect(() => importPen('pas du json')).toThrow(PenImportError)
    expect(() => importPen({ format: 'maquette' })).toThrow(/not a Pen document/)
    expect(() => importPen({ version: '3.0', children: [] })).toThrow(/unsupported Pen format version 3.0/)
    expect(() => importPen(null)).toThrow(PenImportError)
  })

  it('un document vide donne une page « Page 1 » ; le texte JSON est accepté', () => {
    const r = importPen(JSON.stringify({ version: '2.6', children: [] }))
    expect(r.doc.pages.map((p) => p.name)).toEqual(['Page 1'])
    expect(r.report.items).toEqual([])
  })

  it('une version plus récente est ouverte et signalée', () => {
    expect(labels(importPen({ version: '2.30', children: [] }))).toHaveProperty(['File made by a newer Pen: unknown properties may be ignored'])
  })
})

describe('import Pen : cadres et mise en page', () => {
  it('cadre de premier niveau : x/y gardés, layout horizontal par défaut, fit_content → hug', () => {
    const { doc } = run([{ type: 'frame', id: 'f1', x: 10, y: 20, name: 'Card', children: [{ type: 'rectangle', id: 'r1', width: 30, height: 40, fill: '#ff0000' }] }])
    const f = get<FrameNode>(doc, 'f1')
    expect(f).toMatchObject({ x: 10, y: 20, name: 'Card', width: { mode: 'hug' }, height: { mode: 'hug' } })
    expect(f.layout).toMatchObject({ mode: 'auto', direction: 'row', gap: 0, padding: [0, 0, 0, 0], justify: 'start', align: 'start' })
    expect(get(doc, 'r1')).toMatchObject({ type: 'shape', width: 30, height: 40, fills: ['#FF0000'] })
    expect(get(doc, 'r1').x).toBeUndefined()
  })

  it('vertical, gap, padding 1/2/4 valeurs, justify/align, clip', () => {
    const { doc } = run([
      { type: 'frame', id: 'a', x: 0, y: 0, layout: 'vertical', gap: 8, padding: 4, justifyContent: 'space_between', alignItems: 'center', clip: true, width: 100, height: 100 },
      { type: 'frame', id: 'b', x: 0, y: 0, padding: [2, 6], justifyContent: 'space_around', alignItems: 'end', width: 10, height: 10 },
      { type: 'frame', id: 'c', x: 0, y: 0, padding: [1, 2, 3, 4], width: 10, height: 10 },
    ])
    expect(get<FrameNode>(doc, 'a')).toMatchObject({ clip: true, layout: { direction: 'column', gap: 8, padding: [4, 4, 4, 4], justify: 'space-between', align: 'center' } })
    expect(get<FrameNode>(doc, 'b').layout).toMatchObject({ padding: [2, 6, 2, 6], justify: 'space-around', align: 'end' })
    expect(get<FrameNode>(doc, 'c').layout).toMatchObject({ padding: [1, 2, 3, 4] })
  })

  it('layout none : cadre libre, enfants positionnés ; layoutPosition absolute dans un cadre automatique', () => {
    const { doc } = run([{
      type: 'frame', id: 'f', x: 0, y: 0, width: 200, height: 100, layout: 'none',
      children: [{ type: 'rectangle', id: 'r', x: 5, y: 6, width: 10, height: 10 }],
    }, {
      type: 'frame', id: 'g', x: 0, y: 0, width: 200, height: 100,
      children: [{ type: 'rectangle', id: 's', x: 7, y: 8, width: 10, height: 10, layoutPosition: 'absolute' }],
    }])
    expect(get<FrameNode>(doc, 'f').layout).toEqual({ mode: 'free' })
    expect(get(doc, 'r')).toMatchObject({ x: 5, y: 6, position: 'flow' })
    expect(get(doc, 's')).toMatchObject({ x: 7, y: 8, position: 'absolute' })
  })

  it('fill_container → fill en flux, sinon le repli entre parenthèses ou une taille estimée', () => {
    const { doc } = run([{
      type: 'frame', id: 'row', x: 0, y: 0, width: 300, height: 50,
      children: [
        { type: 'rectangle', id: 'grow', width: 'fill_container', height: 'fill_container' },
        { type: 'rectangle', id: 'abs', width: 'fill_container(40)', height: 10, layoutPosition: 'absolute', x: 0, y: 0 },
      ],
    }, { type: 'rectangle', id: 'alone', x: 0, y: 0, width: 'fill_container(120)', height: 'fill_container' }])
    expect(get(doc, 'grow')).toMatchObject({ width: { mode: 'fill' }, height: { mode: 'fill' } })
    expect(get(doc, 'abs').width).toBe(40)
    expect(get(doc, 'alone').width).toBe(120)
    expect(typeof get(doc, 'alone').height).toBe('number')
  })

  it('fit_content sur un cadre libre : repli numérique (taille des enfants)', () => {
    const { doc } = run([{
      type: 'frame', id: 'f', x: 0, y: 0, layout: 'none', width: 'fit_content(77)',
      children: [{ type: 'rectangle', id: 'r', x: 10, y: 20, width: 30, height: 40 }],
    }])
    expect(get(doc, 'f')).toMatchObject({ width: 77, height: 60 })
  })

  it('hug qui contient un fill sur le même axe : l’enfant automatique suit son contenu et s’étire', () => {
    const { doc } = run([{
      type: 'frame', id: 'row', x: 0, y: 0, width: 300,
      children: [
        { type: 'rectangle', id: 'tall', width: 10, height: 40 },
        { type: 'frame', id: 'side', layout: 'vertical', height: 'fill_container', children: [{ type: 'rectangle', id: 'x', width: 5, height: 5 }] },
      ],
    }])
    expect(get(doc, 'row').height).toEqual({ mode: 'hug' })
    expect(get(doc, 'side')).toMatchObject({ height: { mode: 'hug' }, alignSelf: 'stretch' })
  })

  it('opacité, enabled:false → caché, nom par défaut', () => {
    const { doc } = run([{ type: 'rectangle', id: 'r', x: 0, y: 0, width: 1, height: 1, opacity: 0.4, enabled: false }])
    expect(get(doc, 'r')).toMatchObject({ opacity: 0.4, visible: false, name: 'Rectangle' })
  })

  it('group → cadre libre qui épouse ses enfants (décalés d’autant)', () => {
    const { doc } = run([{
      type: 'group', id: 'g', x: 100, y: 50, children: [
        { type: 'rectangle', id: 'a', x: 10, y: 20, width: 30, height: 30 },
        { type: 'rectangle', id: 'b', x: 50, y: 60, width: 10, height: 10 },
      ],
    }])
    expect(get(doc, 'g')).toMatchObject({ type: 'frame', x: 110, y: 70, width: 50, height: 50, layout: { mode: 'free' }, fills: [] })
    expect(get(doc, 'a')).toMatchObject({ x: 0, y: 0 })
    expect(get(doc, 'b')).toMatchObject({ x: 40, y: 40 })
  })

  it('notes, prompts, scripts et types inconnus retirés et comptés ; rotation signalée', () => {
    const r = run([
      { type: 'note', id: 'n', x: 0, y: 0, width: 10, height: 10, content: 'à faire' },
      { type: 'prompt', id: 'p', x: 0, y: 0, width: 10, height: 10, content: 'x' },
      { type: 'script', id: 's', x: 0, y: 0 },
      { type: 'hologram', id: 'h', x: 0, y: 0 },
      { type: 'rectangle', id: 'r', x: 0, y: 0, width: 10, height: 10, rotation: 12 },
    ])
    expect(top(r.doc).map((n) => n.id)).toEqual(['r'])
    expect(labels(r)).toMatchObject({
      'Notes, prompts and AI context removed': 2,
      'Script and browser layers removed': 1,
      'Unknown layer types removed': 1,
      'Rotations ignored': 1,
    })
  })
})

describe('import Pen : texte', () => {
  it('textGrowth auto / fixed-width / fixed-width-height → auto / auto-height / fixed', () => {
    const { doc } = run([{
      type: 'frame', id: 'col', x: 0, y: 0, width: 300, layout: 'vertical', children: [
        { type: 'text', id: 't1', content: 'Auto' },
        { type: 'text', id: 't2', content: 'Wrap', textGrowth: 'fixed-width', width: 'fill_container' },
        { type: 'text', id: 't3', content: 'Box', textGrowth: 'fixed-width-height', width: 120, height: 40, textAlignVertical: 'middle' },
      ],
    }])
    expect(get(doc, 't1')).toMatchObject({ textSizing: 'auto', width: { mode: 'hug' }, height: { mode: 'hug' } })
    expect(get(doc, 't2')).toMatchObject({ textSizing: 'auto-height', width: { mode: 'fill' }, height: { mode: 'hug' } })
    expect(get(doc, 't3')).toMatchObject({ textSizing: 'fixed', width: 120, height: 40 })
  })

  it('interligne : ratio → px arrondi ; auto → métrique de la police (Inter) ou 1.2', () => {
    const { doc } = run([
      { type: 'text', id: 'a', x: 0, y: 0, content: 'x', fontSize: 15, lineHeight: 1.5 },
      { type: 'text', id: 'b', x: 0, y: 0, content: 'x', fontSize: 20, fontFamily: 'Inter' },
      { type: 'text', id: 'c', x: 0, y: 0, content: 'x', fontSize: 20, fontFamily: 'Mystery Sans' },
    ])
    expect(get<TextNode>(doc, 'a').lineHeight).toBe(23)
    expect(get<TextNode>(doc, 'b').lineHeight).toBe(24)
    expect(get<TextNode>(doc, 'c').lineHeight).toBe(24)
  })

  it('police, graisse en chaîne, italique, alignement, tracking, défauts Pen (Inter 14, noir)', () => {
    const { doc } = run([
      { type: 'text', id: 'a', x: 0, y: 0, content: 'Bonjour', fontFamily: 'Geist', fontWeight: 'normal', fontStyle: 'italic', textAlign: 'center', letterSpacing: -0.5, fill: '#336699' },
      { type: 'text', id: 'b', x: 0, y: 0, content: 'B', fontWeight: '600' },
      { type: 'text', id: 'c', x: 0, y: 0, content: 'C', fontWeight: 'bold' },
    ])
    expect(get(doc, 'a')).toMatchObject({ fontFamily: 'Geist', fontWeight: 400, fontStyle: 'italic', textAlign: 'center', letterSpacing: -0.5, color: '#336699' })
    expect(get(doc, 'b')).toMatchObject({ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: '#000000' })
    expect(get<TextNode>(doc, 'c').fontWeight).toBe(700)
  })

  it('texte en dégradé : première couleur, signalé ; alignement vertical signalé', () => {
    const r = run([{
      type: 'text', id: 't', x: 0, y: 0, content: 'x', textGrowth: 'fixed-width-height', width: 10, height: 10, textAlignVertical: 'middle',
      fill: { type: 'gradient', colors: [{ color: '#112233', position: 0 }, { color: '#445566', position: 1 }] },
    }])
    expect(get<TextNode>(r.doc, 't').color).toBe('#112233')
    expect(labels(r)).toMatchObject({ 'Gradient texts drawn with their first color': 1, 'Vertical text alignment ignored': 1 })
  })
})

describe('import Pen : remplissages, variables, thèmes', () => {
  it('variables de couleur → couleurs nommées ; nombres et textes en dur', () => {
    const { doc } = run([
      { type: 'frame', id: 'f', x: 0, y: 0, width: '$w', height: 10, fill: '$brand', cornerRadius: '$r', children: [
        { type: 'text', id: 't', content: '$label', fontFamily: '$font', fill: '$brand' },
      ] },
    ], {
      variables: {
        brand: { type: 'color', value: '#FF6600' },
        w: { type: 'number', value: 320 },
        r: { type: 'number', value: 12 },
        label: { type: 'string', value: 'Salut' },
        font: { type: 'string', value: 'Inter Tight' },
      },
    })
    expect(doc.styles.colors).toEqual([{ id: expect.any(String), name: 'brand', value: '#FF6600' }])
    const style = { style: doc.styles.colors[0]!.id }
    expect(get(doc, 'f')).toMatchObject({ width: 320, radius: 12, fills: [style] })
    expect(get(doc, 't')).toMatchObject({ content: 'Salut', fontFamily: 'Inter Tight', color: style })
  })

  it('thèmes : premier thème de chaque axe ; un sous-arbre d’un autre thème reçoit les valeurs en dur', () => {
    const r = run([
      { type: 'rectangle', id: 'light', x: 0, y: 0, width: 1, height: 1, fill: '$bg' },
      { type: 'frame', id: 'dark', x: 0, y: 0, width: 1, height: 1, theme: { mode: 'dark' }, fill: '$bg', children: [
        { type: 'rectangle', id: 'inner', width: 1, height: 1, fill: '$bg' },
      ] },
    ], {
      themes: { mode: ['light', 'dark'] },
      variables: { bg: { type: 'color', value: [{ value: '#FFFFFF' }, { value: '#111111', theme: { mode: 'dark' } }] } },
    })
    const id = r.doc.styles.colors[0]!.id
    expect(r.doc.styles.colors[0]!.value).toBe('#FFFFFF')
    expect(get<ShapeNode>(r.doc, 'light').fills).toEqual([{ style: id }])
    expect(get<FrameNode>(r.doc, 'dark').fills).toEqual(['#111111'])
    expect(get<ShapeNode>(r.doc, 'inner').fills).toEqual(['#111111'])
    expect(labels(r)).toMatchObject({ 'Other themes not imported (first theme of each axis shown)': 1 })
  })

  it('pile de remplissages : couleurs (3, 6, 8 chiffres), désactivés ignorés, objet color', () => {
    const { doc } = run([{ type: 'rectangle', id: 'r', x: 0, y: 0, width: 1, height: 1, fill: ['#abc', '#11223344', { type: 'color', color: '#00FF00', enabled: false }, { type: 'color', color: '#0000FF' }] }])
    expect(get<ShapeNode>(doc, 'r').fills).toEqual(['#AABBCC', '#11223344', '#0000FF'])
  })

  it('dégradé linéaire : rotation Pen (anti-horaire, 0 = haut) → angle CSS ; opacité appliquée', () => {
    const { doc } = run([
      { type: 'rectangle', id: 'down', x: 0, y: 0, width: 100, height: 100, fill: { type: 'gradient', gradientType: 'linear', rotation: 180, colors: [{ color: '#000000', position: 0 }, { color: '#FFFFFF', position: 1 }] } },
      { type: 'rectangle', id: 'left', x: 0, y: 0, width: 100, height: 100, fill: { type: 'gradient', rotation: 90, opacity: 0.5, colors: [{ color: '#000000', position: 0 }, { color: '#FFFFFF', position: 1 }] } },
    ])
    expect(get<ShapeNode>(doc, 'down').fills[0]).toEqual({ type: 'linear', angle: 180, stops: [{ color: '#000000', position: 0 }, { color: '#FFFFFF', position: 1 }] })
    expect(get<ShapeNode>(doc, 'left').fills[0]).toMatchObject({ angle: 270, stops: [{ color: '#00000080' }, { color: '#FFFFFF80' }] })
  })

  it('dégradé plus long que la boîte : arrêts coupés au bord avec la couleur interpolée', () => {
    const g = penLinear([{ color: '#000000', hex: '#000000', position: 0 }, { color: '#FFFFFF', hex: '#FFFFFF', position: 1 }], { rotation: 180, center: { x: 0.5, y: 0.5 }, size: { width: 1, height: 2 } }, 100, 100)
    expect(g.stops).toEqual([{ color: '#404040', position: 0 }, { color: '#BFBFBF', position: 1 }])
    expect(clampStops([{ color: '#000000', hex: '#000000', position: 0.2 }, { color: '#FFFFFF', hex: '#FFFFFF', position: 0.6 }])).toHaveLength(2)
  })

  it('radial centré → radial ; centre décalé → approché (signalé) ; angulaire → conique', () => {
    const stops = [{ color: '#000000', hex: '#000000', position: 0 }, { color: '#FFFFFF', hex: '#FFFFFF', position: 1 }]
    const centered = penRadial(stops, { rotation: 0, center: { x: 0.5, y: 0.5 }, size: { width: 1, height: 1 } }, 100, 100)
    expect(centered.gradient.type).toBe('radial')
    expect(centered.gradient.stops[1]!.position).toBeCloseTo(0.7071, 3)
    const r = run([
      { type: 'rectangle', id: 'corner', x: 0, y: 0, width: 100, height: 100, fill: { type: 'gradient', gradientType: 'radial', center: { x: 1, y: 0 }, colors: [{ color: '#FF0000', position: 0 }, { color: '#FF000000', position: 1 }] } },
      { type: 'rectangle', id: 'conic', x: 0, y: 0, width: 100, height: 100, fill: { type: 'gradient', gradientType: 'angular', rotation: 90, colors: [{ color: '#FF0000', position: 0 }, { color: '#0000FF', position: 1 }] } },
    ])
    expect(get<ShapeNode>(r.doc, 'corner').fills[0]).toMatchObject({ type: 'linear', angle: 45 })
    expect(get<ShapeNode>(r.doc, 'conic').fills[0]).toMatchObject({ type: 'conic', angle: 270 })
    expect(labels(r)).toMatchObject({ 'Off-center radial gradients approximated': 1 })
  })

  it('image : url résolue par l’appelant, modes cover/contain/stretch, introuvable signalée', () => {
    const fill = (url: string, mode?: string) => ({ type: 'image', enabled: true, url, ...(mode ? { mode } : {}) })
    const r = run([
      { type: 'rectangle', id: 'a', x: 0, y: 0, width: 10, height: 10, fill: fill('img/a.png', 'cover') },
      { type: 'frame', id: 'b', x: 0, y: 0, width: 10, height: 10, fill: fill('img/b.png', 'contain') },
      { type: 'rectangle', id: 'c', x: 0, y: 0, width: 10, height: 10, fill: fill('img/c.png', 'stretch') },
      { type: 'rectangle', id: 'd', x: 0, y: 0, width: 10, height: 10, fill: fill('img/missing.png') },
    ], {}, (url) => (url.includes('missing') ? null : `assets/${url.slice(4)}`))
    expect(get<ShapeNode>(r.doc, 'a').fills).toEqual([{ type: 'image', src: 'assets/a.png', fit: 'cover' }])
    expect(get<FrameNode>(r.doc, 'b').fills).toEqual([{ type: 'image', src: 'assets/b.png', fit: 'contain' }])
    expect(get<ShapeNode>(r.doc, 'c').fills).toEqual([{ type: 'image', src: 'assets/c.png', fit: 'fill' }])
    expect(get<ShapeNode>(r.doc, 'd').fills).toEqual([{ type: 'image', src: '', fit: 'cover' }])
    expect(labels(r)).toMatchObject({ 'Images not found': 1 })
    expect(penImageUrls(pen([{ type: 'rectangle', fill: fill('x.png') }, { type: 'frame', children: [{ type: 'rectangle', fill: [fill('y.jpg'), '#fff'] }] }]))).toEqual(['x.png', 'y.jpg'])
  })

  it('anciennes versions : mode d’image absent = stretch avant 2.20, fill = cover', () => {
    const { doc } = importPen({ version: '2.17', children: [
      { type: 'rectangle', id: 'a', x: 0, y: 0, width: 1, height: 1, fill: { type: 'image', url: 'a.png' } },
      { type: 'rectangle', id: 'b', x: 0, y: 0, width: 1, height: 1, fill: { type: 'image', url: 'b.png', mode: 'fill' } },
    ] }, { image: (u) => `assets/${u}` })
    expect((get<ShapeNode>(doc, 'a').fills[0] as { fit: string }).fit).toBe('fill')
    expect((get<ShapeNode>(doc, 'b').fills[0] as { fit: string }).fit).toBe('cover')
  })

  it('shader retiré, mesh gradient → couleur moyenne, signalés', () => {
    const r = run([{ type: 'rectangle', id: 'r', x: 0, y: 0, width: 1, height: 1, fill: [
      { type: 'shader', url: 'grain.glsl' },
      { type: 'mesh_gradient', colors: ['#000000', '#FFFFFF'] },
    ] }])
    expect(get<ShapeNode>(r.doc, 'r').fills).toEqual(['#808080'])
    expect(labels(r)).toMatchObject({ 'Shader fills and effects removed': 1, 'Mesh gradients replaced by their average color': 1 })
  })
})

describe('import Pen : contours et effets', () => {
  it('alignement inner/center/outer (centre par défaut), largeur en variable', () => {
    const { doc } = run([
      { type: 'rectangle', id: 'a', x: 0, y: 0, width: 1, height: 1, stroke: '#111111', strokeWidth: 2, strokeAlignment: 'inner' },
      { type: 'rectangle', id: 'b', x: 0, y: 0, width: 1, height: 1, stroke: '#111111', strokeWidth: 1 },
      { type: 'frame', id: 'c', x: 0, y: 0, width: 1, height: 1, stroke: '#111111', strokeWidth: '$sw', strokeAlignment: 'outer' },
    ], { variables: { sw: { type: 'number', value: 3 } } })
    expect(get(doc, 'a')).toMatchObject({ stroke: { color: '#111111', width: 2, align: 'inside' } })
    expect(get(doc, 'b')).toMatchObject({ stroke: { align: 'center' } })
    expect(get(doc, 'c')).toMatchObject({ stroke: { width: 3, align: 'outside' } })
  })

  it('contour sur un seul côté → ombre intérieure pleine de ce côté (signalé) ; côtés égaux → contour', () => {
    const r = run([
      { type: 'frame', id: 'a', x: 0, y: 0, width: 1, height: 1, stroke: '#EEEEEE', strokeWidth: { bottom: 1 }, strokeAlignment: 'inner' },
      { type: 'frame', id: 'b', x: 0, y: 0, width: 1, height: 1, stroke: '#EEEEEE', strokeWidth: { top: 2, right: 2, bottom: 2, left: 2 } },
    ])
    expect(get<FrameNode>(r.doc, 'a').stroke).toBeUndefined()
    expect(get<FrameNode>(r.doc, 'a').shadows).toEqual([{ x: 0, y: -1, blur: 0, spread: 0, color: '#EEEEEE', inset: true }])
    expect(get<FrameNode>(r.doc, 'b').stroke).toEqual({ color: '#EEEEEE', width: 2, align: 'center' })
    expect(labels(r)).toMatchObject({ 'Strokes on some sides only, drawn as shadows': 1 })
  })

  it('contour sans strokeWidth : pas de contour (comme Pen)', () => {
    const { doc } = run([{ type: 'frame', id: 'a', x: 0, y: 0, width: 1, height: 1, stroke: '#111111', strokeAlignment: 'inner' }])
    expect(get<FrameNode>(doc, 'a').stroke).toBeUndefined()
    expect(get<FrameNode>(doc, 'a').shadows).toEqual([])
  })

  it('contour en dégradé : première couleur, signalé', () => {
    const r = run([{ type: 'rectangle', id: 'a', x: 0, y: 0, width: 1, height: 1, strokeWidth: 1, stroke: { type: 'gradient', colors: [{ color: '#123456', position: 0 }, { color: '#FFFFFF', position: 1 }] } }])
    expect(get(r.doc, 'a')).toMatchObject({ stroke: { color: '#123456' } })
    expect(labels(r)).toMatchObject({ 'Gradient strokes drawn with their first color': 1 })
  })

  it('ombres, flou du calque et d’arrière-plan (rayon Pen = 2 × écart-type)', () => {
    const { doc } = run([{ type: 'frame', id: 'f', x: 0, y: 0, width: 1, height: 1, effect: [
      { type: 'shadow', shadowType: 'outer', color: '#0000001F', offset: { x: 0, y: 4 }, blur: 12 },
      { type: 'shadow', shadowType: 'inner', color: '#FFFFFF', offset: { x: 1, y: 1 } },
      { type: 'blur', radius: 8 },
      { type: 'background_blur', radius: 20 },
      { type: 'shadow', enabled: false, offset: { x: 9, y: 9 } },
    ] }])
    expect(get(doc, 'f')).toMatchObject({
      shadows: [
        { x: 0, y: 4, blur: 12, spread: 0, color: '#0000001F', inset: false },
        { x: 1, y: 1, blur: 0, spread: 0, color: '#FFFFFF', inset: true },
      ],
      blur: 4,
      backgroundBlur: 10,
    })
  })

  it('avant 2.19 : ombre « inner » relue comme externe, spread ignoré (comme Pen)', () => {
    const { doc } = importPen({ version: '2.17', children: [{ type: 'frame', id: 'f', x: 0, y: 0, width: 1, height: 1, effect: { type: 'shadow', shadowType: 'inner', spread: 4, offset: { x: 0, y: 2 } } }] })
    expect(get<FrameNode>(doc, 'f').shadows).toEqual([{ x: 0, y: 2, blur: 0, spread: 0, color: '#000000', inset: false }])
    expect(migratePen({ version: '2.10', children: [{ type: 'icon_font', iconFontName: 'star', iconFontFamily: 'lucide' }] }, [2, 10]).children).toEqual([{ type: 'icon', icon: 'star', library: 'lucide' }])
  })
})

describe('import Pen : formes, chemins, icônes', () => {
  it('ellipse → forme ; arc et anneau → vecteur ; polygone → vecteur', () => {
    const { doc } = run([
      { type: 'ellipse', id: 'e', x: 0, y: 0, width: 20, height: 10, fill: '#FF0000' },
      { type: 'ellipse', id: 'ring', x: 0, y: 0, width: 88, height: 88, innerRadius: 0.74, startAngle: 180, sweepAngle: -180, fill: '#00FF00' },
      { type: 'polygon', id: 'tri', x: 0, y: 0, width: 30, height: 30, polygonCount: 3, fill: '#0000FF' },
    ])
    expect(get(doc, 'e')).toMatchObject({ type: 'shape', shape: 'ellipse' })
    expect(get<VectorNode>(doc, 'ring')).toMatchObject({ type: 'vector', viewBox: [0, 0, 88, 88], fills: ['#00FF00'], width: 88 })
    expect(get<VectorNode>(doc, 'tri')).toMatchObject({ type: 'vector', path: 'M15 0L27.99 22.5L2.01 22.5Z' })
    expect(arcPath(10, 10, 0, 0, 360).fillRule).toBe('nonzero')
    expect(arcPath(10, 10, 0.5, 0, 360).fillRule).toBe('evenodd')
  })

  it('path → vecteur (viewBox donnée, sinon boîte du tracé), evenodd, contour ; image refusée', () => {
    const r = run([
      { type: 'path', id: 'p', x: 1, y: 2, width: 16, height: 16, geometry: 'M12 1.5l3 6z', viewBox: [0, 0, 24, 24], fill: '#FFCC00', fillRule: 'evenodd', stroke: '#000000', strokeWidth: 2 },
      { type: 'path', id: 'q', x: 0, y: 0, width: 10, height: 10, geometry: 'M10 10L30 40', fill: { type: 'image', url: 'x.png' } },
    ])
    expect(get<VectorNode>(r.doc, 'p')).toMatchObject({ viewBox: [0, 0, 24, 24], fillRule: 'evenodd', fills: ['#FFCC00'], stroke: { width: 2 } })
    expect(get<VectorNode>(r.doc, 'q')).toMatchObject({ viewBox: [10, 10, 20, 30], fills: [] })
    expect(labels(r)).toMatchObject({ 'Image fills on paths removed': 1 })
  })

  it('icônes : même jeu et graisse ; Material Outlined → Rounded ; logo de marque → Phosphor ; jeu inconnu → carré gris', () => {
    const r = run([
      { type: 'icon', id: 'l', x: 0, y: 0, width: 24, height: 24, icon: 'arrow-right', library: 'lucide', fill: '#111111' },
      { type: 'icon', id: 'ph', x: 0, y: 0, width: 20, height: 20, icon: 'gas-pump', library: 'phosphor', weight: 600, fill: '#222222' },
      { type: 'icon', id: 'm', x: 0, y: 0, width: 20, height: 20, icon: 'content_cut', library: 'Material Symbols Outlined', weight: 300 },
      { type: 'icon', id: 'fb', x: 0, y: 0, width: 20, height: 20, icon: 'facebook', library: 'lucide' },
      { type: 'icon', id: 'x', x: 0, y: 0, width: 20, height: 20, icon: 'star', library: 'fontawesome' },
    ])
    expect(get<IconNode>(r.doc, 'l')).toMatchObject({ type: 'icon', set: 'lucide', icon: 'arrow-right', color: '#111111' })
    expect(get<IconNode>(r.doc, 'ph')).toMatchObject({ set: 'phosphor', icon: 'gas-pump', weight: 'bold' })
    expect(get<IconNode>(r.doc, 'm')).toMatchObject({ set: 'material-rounded', icon: 'content_cut', weight: 300 })
    expect(get<IconNode>(r.doc, 'fb')).toMatchObject({ set: 'phosphor', icon: 'facebook-logo' })
    expect(get(r.doc, 'x')).toMatchObject({ type: 'shape', fills: ['#D9D9D9'], width: 20 })
    expect(labels(r)).toMatchObject({
      'Material Outlined and Sharp icons drawn as Material Rounded': 1,
      'Brand logos missing from Lucide, drawn with Phosphor': 1,
      'Icons from an unknown set, drawn as grey squares': 1,
    })
  })
})

describe('import Pen : composants', () => {
  const button = {
    type: 'frame', id: 'btn', x: 0, y: 0, reusable: true, name: 'Button', padding: [8, 16], fill: '#000000', children: [
      { type: 'icon', id: 'ico', width: 16, height: 16, icon: 'star', library: 'lucide', fill: '#FFFFFF' },
      { type: 'text', id: 'lbl', content: 'Button', fill: '#FFFFFF' },
    ],
  }

  it('reusable → principal ; ref → instance liée (source par id, surcharges de la racine et des descendants)', () => {
    const { doc } = run([button, {
      type: 'ref', id: 'i1', ref: 'btn', x: 200, y: 0, fill: '#FF0000', descendants: { lbl: { content: 'Buy' }, ico: { enabled: false } },
    }])
    const main = get<FrameNode>(doc, 'btn')
    expect(main.component).toBe(true)
    const inst = get<FrameNode>(doc, 'i1')
    expect(inst).toMatchObject({ instanceOf: 'btn', x: 200, y: 0, fills: ['#FF0000'], overrides: ['fills'] })
    const lbl = findInInstance(doc, inst, 'lbl') as TextNode
    expect(lbl).toMatchObject({ content: 'Buy', source: 'lbl', overrides: ['content'] })
    expect(findInInstance(doc, inst, 'ico')).toMatchObject({ visible: false, overrides: ['visible'] })
  })

  it('instance imbriquée : chemin « instance/calque », copie liée au principal englobant', () => {
    const { doc } = run([button, {
      type: 'frame', id: 'card', x: 0, y: 100, reusable: true, layout: 'vertical', children: [
        { type: 'text', id: 'ttl', content: 'Title' },
        { type: 'ref', id: 'cta', ref: 'btn' },
      ],
    }, { type: 'ref', id: 'c1', ref: 'card', x: 300, y: 100, descendants: { 'cta/lbl': { content: 'Go' }, ttl: { content: 'Hello' } } }])
    const c1 = get<FrameNode>(doc, 'c1')
    expect(c1.instanceOf).toBe('card')
    const nested = findInInstance(doc, c1, 'cta') as FrameNode
    expect(nested).toMatchObject({ source: 'cta', instanceOf: 'btn' })
    expect(findInInstance(doc, c1, 'cta/lbl')).toMatchObject({ content: 'Go', overrides: ['content'] })
    expect(findInInstance(doc, c1, 'ttl')).toMatchObject({ content: 'Hello' })
    // L'instance posée dans le principal suit son propre principal.
    expect(get<FrameNode>(doc, 'cta').instanceOf).toBe('btn')
  })

  it('remplacement (descendant avec type) et slot (children) : calques locaux', () => {
    const { doc } = run([{
      type: 'frame', id: 'm', x: 0, y: 0, reusable: true, layout: 'vertical', children: [
        { type: 'text', id: 'head', content: 'Head' },
        { type: 'frame', id: 'slot', slot: [], layout: 'vertical' },
      ],
    }, {
      type: 'ref', id: 'i', ref: 'm', x: 0, y: 200, descendants: {
        head: { type: 'icon', id: 'newIcon', icon: 'heart', library: 'lucide', width: 24, height: 24 },
        slot: { children: [{ type: 'text', id: 'inSlot', content: 'Slot content' }] },
      },
    }])
    const inst = get<FrameNode>(doc, 'i')
    const head = inst.children[0]!
    expect(head).toMatchObject({ type: 'icon', icon: 'heart', source: 'head' })
    const slot = inst.children[1] as FrameNode
    expect(slot.source).toBe('slot')
    expect(slot.overrides).toContain('children')
    expect(slot.children[0]).toMatchObject({ type: 'text', content: 'Slot content' })
    expect(slot.children[0]!.source).toBeUndefined()
  })

  it('variante (ref réutilisable) : composant indépendant ; ses instances la suivent, slot compris', () => {
    const r = run([{
      type: 'frame', id: 'base', x: 0, y: 0, reusable: true, layout: 'vertical', children: [
        { type: 'frame', id: 'slot', layout: 'vertical' },
      ],
    }, {
      type: 'ref', id: 'variant', ref: 'base', reusable: true, x: 0, y: 100, fill: '#EEEEEE',
      descendants: { slot: { children: [{ type: 'text', id: 'vt', content: 'Variant text' }] } },
    }, { type: 'ref', id: 'use', ref: 'variant', x: 0, y: 200, descendants: { vt: { content: 'Used' } } }])
    const v = get<FrameNode>(r.doc, 'variant')
    expect(v).toMatchObject({ component: true, fills: ['#EEEEEE'] })
    expect(v.instanceOf).toBeUndefined()
    const use = get<FrameNode>(r.doc, 'use')
    expect(use.instanceOf).toBe('variant')
    const text = findInInstance(r.doc, use, [(v.children[0] as FrameNode).id, (v.children[0] as FrameNode).children[0]!.id].slice(1))
    expect(text).toMatchObject({ content: 'Used', overrides: ['content'] })
    expect(labels(r)).toMatchObject({ 'Component variants made independent components': 1 })
  })

  it('composant introuvable : cadre vide signalé ; boucle évitée', () => {
    const r = run([
      { type: 'ref', id: 'ghost', ref: 'nope', x: 0, y: 0, width: 50, height: 20 },
      { type: 'frame', id: 'loop', x: 0, y: 100, reusable: true, children: [{ type: 'ref', id: 'self', ref: 'loop' }] },
    ])
    expect(get(r.doc, 'ghost')).toMatchObject({ type: 'frame', width: 50, height: 20, children: [] })
    expect(labels(r)).toMatchObject({ 'Instances of a missing component (empty frames)': 1 })
    expect(labels(r)['Components that contain themselves (loop broken)']).toBeGreaterThan(0)
    expect(get<FrameNode>(r.doc, 'self').instanceOf).toBeUndefined()
  })
})
