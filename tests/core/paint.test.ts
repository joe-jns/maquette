import { describe, it, expect } from 'vitest'
import { fillsCss, nodeCss } from '../../src/core/css'
import { parseDocument, serializeDocument } from '../../src/core/format'
import { applyOps } from '../../src/core/ops'
import { normalizeFill, parseCssGradient } from '../../src/core/paint'
import { repairDocument } from '../../src/core/repair'
import { validateDocument } from '../../src/core/rules'
import type { DocStyles, Fill, MaquetteDocument, ShapeNode } from '../../src/core/types'
import { docWith, frame, rect } from './helpers'

const styles: DocStyles = { colors: [{ id: 'c00001', name: 'accent', value: '#C2410C' }], text: [] }
const linear = (angle: number, ...stops: [string | { style: string }, number][]): Fill =>
  ({ type: 'linear', angle, stops: stops.map(([color, position]) => ({ color, position })) })

describe('dégradés : lecture tolérante', () => {
  it('CSS linéaire : angle, côtés, positions en %, couleurs CSS', () => {
    expect(parseCssGradient('linear-gradient(135deg, #fff 0%, rgba(0, 0, 0, 0.5) 100%)')).toEqual(
      linear(135, ['#FFFFFF', 0], ['#00000080', 1]),
    )
    expect(parseCssGradient('linear-gradient(to right, red, blue)')).toEqual(linear(90, ['#FF0000', 0], ['#0000FF', 1]))
    expect(parseCssGradient('linear-gradient(red, white 30%, blue)')).toEqual(linear(180, ['#FF0000', 0], ['#FFFFFF', 0.3], ['#0000FF', 1]))
    expect(parseCssGradient('linear-gradient(0.25turn, red, blue)')).toMatchObject({ angle: 90 })
  })

  it('CSS radial : la forme est ignorée', () => {
    expect(parseCssGradient('radial-gradient(circle at center, #000, #fff)')).toEqual({
      type: 'radial', stops: [{ color: '#000000', position: 0 }, { color: '#FFFFFF', position: 1 }],
    })
  })

  it('CSS illisible : null', () => {
    expect(parseCssGradient('linear-gradient(nimporte, quoi)')).toBeNull()
    expect(parseCssGradient('conic-gradient(nimporte, quoi)')).toBeNull()
    expect(parseCssGradient('conic-gradient(from zut, red, blue)')).toBeNull()
  })

  it('CSS conique : angle de départ (« from »), centre ignoré, 0 par défaut', () => {
    const stops = [{ color: '#FF0000', position: 0 }, { color: '#0000FF', position: 1 }]
    expect(parseCssGradient('conic-gradient(red, blue)')).toEqual({ type: 'conic', angle: 0, stops })
    expect(parseCssGradient('conic-gradient(from 90deg at 50% 50%, red, blue)')).toEqual({ type: 'conic', angle: 90, stops })
    expect(parseCssGradient('conic-gradient(at 30% 40%, red, blue)')).toEqual({ type: 'conic', angle: 0, stops })
    expect(parseCssGradient('conic-gradient(from 0.5turn, red, blue)')).toMatchObject({ angle: 180 })
  })

  it('formes Figma et Pen', () => {
    expect(normalizeFill({
      type: 'GRADIENT_LINEAR',
      gradientStops: [{ color: { r: 1, g: 0, b: 0, a: 1 }, position: 0 }, { color: { r: 0, g: 0, b: 1, a: 0.5 }, position: 1 }],
    })).toEqual(linear(180, ['#FF0000', 0], ['#0000FF80', 1]))
    expect(normalizeFill({ type: 'gradient', gradientType: 'radial', colors: [{ color: '#111', position: 0 }, { color: '#eee', position: 1 }] }))
      .toEqual({ type: 'radial', stops: [{ color: '#111111', position: 0 }, { color: '#EEEEEE', position: 1 }] })
    expect(normalizeFill({ type: 'linear', angle: 90, from: '#000', to: 'white' })).toEqual(linear(90, ['#000000', 0], ['#FFFFFF', 1]))
    // Conique : Figma GRADIENT_ANGULAR, Pen gradientType "angular" ; sans angle, départ en haut.
    expect(normalizeFill({ type: 'GRADIENT_ANGULAR', gradientStops: [{ color: { r: 1, g: 0, b: 0, a: 1 }, position: 0 }, { color: { r: 0, g: 0, b: 1, a: 1 }, position: 1 }] }))
      .toEqual({ type: 'conic', angle: 0, stops: [{ color: '#FF0000', position: 0 }, { color: '#0000FF', position: 1 }] })
    expect(normalizeFill({ type: 'gradient', gradientType: 'angular', rotation: 45, colors: ['#000', '#fff'] }))
      .toEqual({ type: 'conic', angle: 45, stops: [{ color: '#000000', position: 0 }, { color: '#FFFFFF', position: 1 }] })
  })

  it('positions en pourcentage, manquantes, désordonnées ; couleur nommée gardée', () => {
    expect(normalizeFill({ type: 'linear', stops: [{ color: '#000', position: 100 }, { color: { style: 'c00001' }, position: 0 }] }))
      .toEqual(linear(180, [{ style: 'c00001' }, 0], ['#000000', 1]))
    expect(normalizeFill({ type: 'linear', angle: 450, stops: ['#000', '#111', '#222'] }))
      .toEqual(linear(90, ['#000000', 0], ['#111111', 0.5], ['#222222', 1]))
  })

  it('une couleur reste une couleur', () => {
    expect(normalizeFill('crimson')).toBe('#DC143C')
    expect(normalizeFill({ style: 'c00001' })).toEqual({ style: 'c00001' })
    expect(normalizeFill({ type: 'conic', stops: [] })).toBeNull()
  })
})

describe('dégradés : rendu CSS', () => {
  it('un dégradé seul, puis empilé sur une couleur (le dernier au-dessus)', () => {
    const g = linear(90, [{ style: 'c00001' }, 0], ['#FFFFFF00', 1])
    expect(fillsCss([g], styles)).toEqual({ backgroundImage: 'linear-gradient(90deg, #C2410C 0%, #FFFFFF00 100%)' })
    expect(fillsCss(['#000000', g], styles)).toEqual({
      backgroundImage: 'linear-gradient(90deg, #C2410C 0%, #FFFFFF00 100%), linear-gradient(#000000, #000000)',
    })
    const radial: Fill = { type: 'radial', stops: [{ color: '#000000', position: 0.25 }, { color: '#FFFFFF', position: 1 }] }
    expect(nodeCss(rect('r00001', { x: 0, y: 0, fills: [radial] }), null, styles).backgroundImage).toBe('radial-gradient(#000000 25%, #FFFFFF 100%)')
    const conic: Fill = { type: 'conic', angle: 90, stops: [{ color: { style: 'c00001' }, position: 0 }, { color: '#FFFFFF', position: 0.5 }] }
    expect(fillsCss([conic], styles)).toEqual({ backgroundImage: 'conic-gradient(from 90deg, #C2410C 0%, #FFFFFF 50%)' })
  })
})

describe('dégradés : document', () => {
  const base = () => docWith([rect('r00001', { x: 0, y: 0 })])

  it('appliquer accepte un dégradé CSS et un objet ; refuse l’illisible', () => {
    const doc = base()
    const r = applyOps(doc, [{ op: 'update', id: 'r00001', set: { fills: ['linear-gradient(to bottom, #fff, #000)'] } }])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect((r.doc.pages[0]!.children[0] as ShapeNode).fills).toEqual([linear(180, ['#FFFFFF', 0], ['#000000', 1])])
    const bad = applyOps(doc, [{ op: 'update', id: 'r00001', set: { fills: ['linear-gradient(zut)'] } }])
    expect(bad.ok).toBe(false)
  })

  it('dégradé conique : accepté par appliquer et le schéma, angle requis', () => {
    const doc = base()
    const r = applyOps(doc, [{ op: 'update', id: 'r00001', set: { fills: ['conic-gradient(from 45deg, #fff, #000)'] } }])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect((r.doc.pages[0]!.children[0] as ShapeNode).fills).toEqual([{ type: 'conic', angle: 45, stops: [{ color: '#FFFFFF', position: 0 }, { color: '#000000', position: 1 }] }])
    expect(validateDocument(r.doc)).toEqual([])
    const copy = structuredClone(r.doc)
    ;(copy.pages[0]!.children[0] as ShapeNode).fills = [{ type: 'conic', stops: [{ color: '#000000', position: 0 }, { color: '#FFFFFF', position: 1 }] } as unknown as Fill]
    expect(validateDocument(copy).length).toBeGreaterThan(0)
  })

  it('un dégradé d’un seul arrêt est refusé par le schéma', () => {
    const doc = base()
    ;(doc.pages[0]!.children[0] as ShapeNode).fills = [{ type: 'linear', angle: 0, stops: [{ color: '#000000', position: 0 }] }]
    expect(validateDocument(doc).length).toBeGreaterThan(0)
  })

  it('arrêts en couleur nommée : validés, détachés à la suppression du style', () => {
    const doc = base()
    const r = applyOps(doc, [
      { op: 'style.color.set', id: '$a', name: 'accent', value: '#C2410C' },
      { op: 'update', id: 'r00001', set: { fills: [{ type: 'linear', angle: 0, stops: [{ color: { style: '$a' }, position: 0 }, { color: '#FFFFFF', position: 1 }] }] } },
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const styleId = r.ids.$a!
    const del = applyOps(r.doc, [{ op: 'style.delete', id: styleId }])
    expect(del.ok).toBe(true)
    if (!del.ok) return
    expect((del.doc.pages[0]!.children[0] as ShapeNode).fills).toEqual([linear(0, ['#C2410C', 0], ['#FFFFFF', 1])])
    expect(del.fixes[0]).toMatch(/1 élément/)
  })

  it('ancien fichier (couleurs seules) : ouvert tel quel, version inchangée ; aller-retour avec dégradé', () => {
    const old = docWith([frame('f00001', { x: 0, y: 0, fills: ['#FFFFFF', '#00000080'] })])
    const parsed = parseDocument(serializeDocument(old))
    expect(parsed).toMatchObject({ ok: true, warnings: [] })
    const doc: MaquetteDocument = docWith([frame('f00001', { x: 0, y: 0, fills: [linear(45, ['#FFFFFF', 0], ['#000000', 1])] })])
    expect(doc.version).toBe(1)
    const again = parseDocument(serializeDocument(doc))
    expect(again.ok && again.doc).toEqual(doc)
  })

  it('réparation : dégradé à réécrire, arrêt illisible, couleur nommée inconnue', () => {
    const raw = JSON.parse(serializeDocument(base())) as Record<string, unknown>
    const shape = (raw as { pages: { children: Record<string, unknown>[] }[] }).pages[0]!.children[0]!
    shape.fills = [
      { type: 'GRADIENT_LINEAR', gradientStops: [{ color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 }, { color: { style: 'zzz' }, position: 1 }] },
      { type: 'linear', stops: 'non' },
    ]
    const { doc, warnings } = repairDocument(raw)
    const fills = (doc as MaquetteDocument).pages[0]!.children[0]! as ShapeNode
    expect(fills.fills).toEqual([linear(180, ['#000000', 0], ['#FF00FF', 1]), '#FF00FF'])
    expect(warnings.map((w) => w.path)).toEqual(expect.arrayContaining(['pages[0].children[0].fills[0]', 'pages[0].children[0].fills[0].stops[1].color', 'pages[0].children[0].fills[1]']))
    expect(validateDocument(doc as MaquetteDocument)).toEqual([])
  })
})

describe('remplissage image', () => {
  const img: Fill = { type: 'image', src: 'assets/abc.png', fit: 'cover' }

  it('lecture : forme Maquette, url/mode de Figma et Pen, fit par défaut', () => {
    expect(normalizeFill(img)).toEqual(img)
    expect(normalizeFill({ type: 'image', url: 'assets/abc.png' })).toEqual(img)
    expect(normalizeFill({ type: 'IMAGE', src: 'a.png', scaleMode: 'FIT' })).toEqual({ type: 'image', src: 'a.png', fit: 'contain' })
    expect(normalizeFill({ type: 'image', url: 'a.png', mode: 'stretch' })).toEqual({ type: 'image', src: 'a.png', fit: 'fill' })
    expect(normalizeFill({ type: 'image' })).toBeNull()
    expect(normalizeFill({ type: 'image', src: 'a.png', mode: 'zut' })).toBeNull()
  })

  it('rendu CSS : couche centrée sans répétition, taille selon fit, sous les couleurs du dessus', () => {
    expect(fillsCss([img], styles, (s) => `masset://doc/${s}`)).toEqual({
      backgroundImage: 'url("masset://doc/assets/abc.png")', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
    })
    expect(fillsCss([{ type: 'image', src: 'a.png', fit: 'fill' }, '#00000080'], styles)).toEqual({
      backgroundImage: 'linear-gradient(#00000080, #00000080), url("a.png")',
      backgroundSize: 'auto, 100% 100%', backgroundPosition: 'center, center', backgroundRepeat: 'no-repeat, no-repeat',
    })
    // Sans fichier : un gris neutre.
    expect(fillsCss([{ type: 'image', src: '', fit: 'cover' }], styles).backgroundImage).toBe('linear-gradient(#E5E5E5, #E5E5E5)')
    expect(nodeCss(frame('f00001', { x: 0, y: 0, fills: [{ type: 'image', src: 'a.png', fit: 'contain' }] }), null, styles, 0, (s) => `u/${s}`))
      .toMatchObject({ backgroundImage: 'url("u/a.png")', backgroundSize: 'contain' })
  })

  it('document : appliquer, schéma, aller-retour, réparation', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const r = applyOps(doc, [{ op: 'update', id: 'r00001', set: { fills: ['#FFFFFF', { type: 'image', url: 'assets/abc.png' }] } }])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect((r.doc.pages[0]!.children[0] as ShapeNode).fills).toEqual(['#FFFFFF', img])
    expect(validateDocument(r.doc)).toEqual([])
    const again = parseDocument(serializeDocument(r.doc))
    expect(again.ok && again.doc).toEqual(r.doc)
    expect(applyOps(doc, [{ op: 'update', id: 'r00001', set: { fills: [{ type: 'image' }] } }]).ok).toBe(false)

    const bad = structuredClone(r.doc)
    ;(bad.pages[0]!.children[0] as ShapeNode).fills = [{ type: 'image', src: 'a.png', fit: 'zoom' } as unknown as Fill]
    expect(validateDocument(bad).length).toBeGreaterThan(0)

    const raw = JSON.parse(serializeDocument(r.doc)) as { pages: { children: Record<string, unknown>[] }[] }
    raw.pages[0]!.children[0]!.fills = [{ type: 'image', url: 'assets/abc.png', scaleMode: 'FILL' }, { type: 'image' }]
    const { doc: fixed, warnings } = repairDocument(raw as unknown as Record<string, unknown>)
    expect(((fixed as MaquetteDocument).pages[0]!.children[0] as ShapeNode).fills).toEqual([img, '#FF00FF'])
    expect(warnings.map((w) => w.message)).toEqual(['image fill rewritten in Maquette format', expect.stringMatching(/^unreadable image fill/)])
    expect(validateDocument(fixed as MaquetteDocument)).toEqual([])
  })

  it('suppression d’un style : une image en remplissage reste intacte', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0, fills: [img] })])
    const r = applyOps(doc, [{ op: 'style.color.set', id: '$a', name: 'a', value: '#000000' }])
    if (!r.ok) throw new Error('refusé')
    const del = applyOps(r.doc, [{ op: 'style.delete', id: r.ids.$a! }])
    expect(del.ok && (del.doc.pages[0]!.children[0] as ShapeNode).fills).toEqual([img])
  })
})
