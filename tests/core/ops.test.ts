import { describe, it, expect } from 'vitest'
import { applyPatches } from 'immer'
import { applyOps, type Measure } from '../../src/core/ops'
import { findNode } from '../../src/core/tree'
import type { FrameNode, MaquetteDocument, TextNode } from '../../src/core/types'
import { docWith, frame, rect, text } from './helpers'

const pageId = (doc: MaquetteDocument) => doc.pages[0]!.id
const ok = (r: ReturnType<typeof applyOps>) => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r
}

describe('applyOps', () => {
  it('crée un cadre puis un enfant via un identifiant temporaire', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'create', parent: pageId(doc), node: { id: '$hero', type: 'frame', layout: { mode: 'auto' } } },
      { op: 'create', parent: '$hero', node: { type: 'text', content: 'Bonjour' } },
    ]))
    const heroId = r.ids['$hero']!
    const hero = findNode(r.doc, heroId)!.node as FrameNode
    expect(hero).toMatchObject({ x: 0, y: 0 })
    expect(hero.children[0]).toMatchObject({ type: 'text', content: 'Bonjour' })
    expect(hero.children[0]!.x).toBeUndefined()
    expect(doc.pages[0]!.children).toHaveLength(0)
  })

  it('refuse un identifiant non temporaire à la création', () => {
    const doc = docWith([])
    const r = applyOps(doc, [{ op: 'create', parent: pageId(doc), node: { id: 'abc123', type: 'shape' } }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('ops[0].node.id')
  })

  it('un lot dont une opération est fausse n’applique rien', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const before = structuredClone(doc)
    const r = applyOps(doc, [
      { op: 'update', id: 'r00001', set: { name: 'Bloc' } },
      { op: 'update', id: 'r00001', set: { opacity: 0.5 } },
      { op: 'update', id: 'absent', set: { name: 'x' } },
      { op: 'update', id: 'r00001', set: { name: 'Autre' } },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatchObject({ path: 'ops[2].id' })
    expect(doc).toEqual(before)
  })

  it('une modification invalide est refusée avec le chemin de l’opération et de l’élément', () => {
    const doc = docWith([frame('f00001', { x: 0, y: 0 })])
    const r = applyOps(doc, [{ op: 'update', id: 'f00001', set: { width: { mode: 'fill' } } }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('ops[0] → pages[0].children[0].width')
  })

  it('les champs id, type et children ne sont pas modifiables', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const r = applyOps(doc, [{ op: 'update', id: 'r00001', set: { type: 'frame' } }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('ops[0].set.type')
  })

  it('null efface une propriété facultative', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0, stroke: { color: '#000000', width: 1, align: 'inside' } })])
    const r = ok(applyOps(doc, [{ op: 'update', id: 'r00001', set: { stroke: null } }]))
    expect(findNode(r.doc, 'r00001')!.node).not.toHaveProperty('stroke')
  })

  it('correction automatique : un parent "hug" passe en fixe quand un enfant devient "fill"', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto', direction: 'row' }, width: { mode: 'hug' } }) as FrameNode
    const measure: Measure = (id) => (id === 'f00001' ? { x: 0, y: 0, width: 321.4, height: 200 } : undefined)
    const r = ok(applyOps(docWith([p]), [{ op: 'create', parent: 'f00001', node: { type: 'shape', width: { mode: 'fill' } } }], { measure }))
    expect((findNode(r.doc, 'f00001')!.node as FrameNode).width).toBe(321)
    expect(r.fixes).toHaveLength(1)
    expect(r.fixes[0]).toContain('f00001')
  })

  it('passer un cadre en mise en page automatique retire x/y des enfants', () => {
    const p = frame('f00001', { x: 0, y: 0 }) as FrameNode
    p.children.push(rect('r00001', { x: 10, y: 20 }))
    const r = ok(applyOps(docWith([p]), [{ op: 'update', id: 'f00001', set: { layout: { mode: 'auto', direction: 'row' } } }]))
    const child = findNode(r.doc, 'r00001')!.node
    expect(child.x).toBeUndefined()
    expect((findNode(r.doc, 'f00001')!.node as FrameNode).layout).toMatchObject({ mode: 'auto', direction: 'row', gap: 0 })
  })

  it('repasser en libre fige les enfants à leur position et taille mesurées', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    p.children.push(rect('r00001', { width: { mode: 'fill' } }))
    const measure: Measure = (id) => (id === 'r00001' ? { x: 5.2, y: 6, width: 77, height: 30 } : undefined)
    const r = ok(applyOps(docWith([p]), [{ op: 'update', id: 'f00001', set: { layout: { mode: 'free' } } }], { measure }))
    expect(findNode(r.doc, 'r00001')!.node).toMatchObject({ x: 5, y: 6, width: 77 })
  })

  it('déplacer un élément dans son propre descendant est refusé', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    p.children.push(frame('f00002', { layout: { mode: 'auto' }, width: 100, height: 100 }))
    const r = applyOps(docWith([p]), [{ op: 'move', id: 'f00001', parent: 'f00002' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('ops[0].parent')
  })

  it('sortir un enfant "fill" d’un cadre automatique le fige et le place', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    p.children.push(rect('r00001', { width: { mode: 'fill' } }))
    const doc = docWith([p])
    const measure: Measure = () => ({ x: 0, y: 0, width: 250, height: 100 })
    const r = ok(applyOps(doc, [{ op: 'move', id: 'r00001', parent: pageId(doc), x: 500, y: 40 }], { measure }))
    expect(r.doc.pages[0]!.children[1]).toMatchObject({ id: 'r00001', x: 500, y: 40, width: 250 })
  })

  it('réordonner dans le même parent', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    p.children.push(rect('r00001'), rect('r00002'), rect('r00003'))
    const r = ok(applyOps(docWith([p]), [{ op: 'move', id: 'r00001', parent: 'f00001', index: 2 }]))
    expect((findNode(r.doc, 'f00001')!.node as FrameNode).children.map((c) => c.id)).toEqual(['r00002', 'r00003', 'r00001'])
  })

  it('supprimer un élément ; impossible de supprimer la dernière page', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const r = ok(applyOps(doc, [{ op: 'delete', id: 'r00001' }]))
    expect(r.doc.pages[0]!.children).toHaveLength(0)
    const r2 = applyOps(doc, [{ op: 'page.delete', id: pageId(doc) }])
    expect(r2.ok).toBe(false)
  })

  it('pages : créer, renommer', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'page.create', id: '$p', name: 'Contact' },
      { op: 'page.update', id: '$p', name: 'Nous joindre' },
    ]))
    expect(r.doc.pages.map((p) => p.name)).toEqual(['Page 1', 'Nous joindre'])
  })

  it('styles nommés : créer et référencer', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'style.color.set', id: '$fond', name: 'fond', value: '#F4F1EA' },
      { op: 'create', parent: pageId(doc), node: { type: 'shape', fills: [{ style: '$fond' }] } },
    ]))
    const styleId = r.ids['$fond']!
    expect(r.doc.styles.colors[0]).toEqual({ id: styleId, name: 'fond', value: '#F4F1EA' })
    const shape = r.doc.pages[0]!.children[0]!
    expect(shape.type === 'shape' && shape.fills[0]).toEqual({ style: styleId })
  })

  it('modifier la police d’un texte détache son style de texte', () => {
    const doc = docWith([])
    doc.styles.text.push({ id: 's00001', name: 'titre', fontFamily: 'Inter', fontWeight: 700, fontStyle: 'normal', fontSize: 40, lineHeight: 48, letterSpacing: 0 })
    doc.pages[0]!.children.push(text('t00001', { x: 0, y: 0, textStyle: 's00001' }))
    const r = ok(applyOps(doc, [{ op: 'update', id: 't00001', set: { fontSize: 18 } }]))
    expect((findNode(r.doc, 't00001')!.node as TextNode).textStyle).toBeUndefined()
  })

  it('créer puis déplacer le même élément dans un seul lot', () => {
    const doc = docWith([frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } })])
    const r = ok(applyOps(doc, [
      { op: 'create', parent: pageId(doc), node: { id: '$r', type: 'shape' } },
      { op: 'move', id: '$r', parent: 'f00001' },
    ]))
    expect((findNode(r.doc, 'f00001')!.node as FrameNode).children[0]!.id).toBe(r.ids['$r'])
  })

  it('un identifiant temporaire de style de texte est résolu', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'style.text.set', id: '$t', name: 'titre', fontFamily: 'Inter', fontWeight: 700, fontStyle: 'normal', fontSize: 40, lineHeight: 48, letterSpacing: 0 },
      { op: 'create', parent: pageId(doc), node: { type: 'text', textStyle: '$t' } },
    ]))
    expect((r.doc.pages[0]!.children[0] as TextNode).textStyle).toBe(r.ids['$t'])
  })

  it('les patchs inverses restaurent exactement le document d’origine', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const r = ok(applyOps(doc, [
      { op: 'update', id: 'r00001', set: { name: 'Bloc', opacity: 0.4 } },
      { op: 'create', parent: pageId(doc), node: { type: 'text', content: 'Été « ok » 🌿' } },
    ]))
    expect(applyPatches(r.doc, r.inversePatches)).toEqual(doc)
  })

  it('supprimer un style utilisé détache les éléments', () => {
    const doc = docWith([])
    const r = ok(applyOps(doc, [
      { op: 'style.color.set', id: '$fond', name: 'fond', value: '#F4F1EA' },
      { op: 'style.text.set', id: '$t', name: 'titre', fontFamily: 'Fraunces', fontWeight: 600, fontStyle: 'normal', fontSize: 64, lineHeight: 68, letterSpacing: -1 },
      { op: 'create', parent: pageId(doc), node: { id: '$s', type: 'shape', fills: [{ style: '$fond' }] } },
      { op: 'create', parent: pageId(doc), node: { id: '$x', type: 'text', textStyle: '$t' } },
    ]))
    const r2 = ok(applyOps(r.doc, [{ op: 'style.delete', id: r.ids['$fond']! }, { op: 'style.delete', id: r.ids['$t']! }]))
    const shape = findNode(r2.doc, r.ids['$s']!)!.node
    expect(shape.type === 'shape' && shape.fills).toEqual(['#F4F1EA'])
    const t = findNode(r2.doc, r.ids['$x']!)!.node as TextNode
    expect(t.textStyle).toBeUndefined()
    expect(t).toMatchObject({ fontFamily: 'Fraunces', fontWeight: 600, fontSize: 64, lineHeight: 68, letterSpacing: -1 })
    expect(r2.fixes).toHaveLength(2)
  })

  it('couleurs CSS converties, couleur illisible refusée avec son chemin', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    const r = ok(applyOps(doc, [{ op: 'update', id: 'r00001', set: { fills: ['white', 'rgba(0,0,0,0.25)'] } }]))
    const shape = findNode(r.doc, 'r00001')!.node
    expect(shape.type === 'shape' && shape.fills).toEqual(['#FFFFFF', '#00000040'])
    const r2 = applyOps(doc, [{ op: 'update', id: 'r00001', set: { fills: ['bleu'] } }])
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.errors[0]!.path).toBe('ops[0].set.fills[0]')
  })

  it('redimensionner un texte en largeur réaligne textSizing au lieu de refuser', () => {
    const doc = docWith([text('t00001', { x: 0, y: 0 })])
    const r = ok(applyOps(doc, [{ op: 'update', id: 't00001', set: { width: 300 } }]))
    expect(findNode(r.doc, 't00001')!.node).toMatchObject({ width: 300, textSizing: 'auto-height' })
    expect(r.fixes).toHaveLength(1)
  })

  it('x/y donnés à un enfant en flux sont ignorés, pas refusés', () => {
    const p = frame('f00001', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    p.children.push(rect('r00001'))
    const r = ok(applyOps(docWith([p]), [{ op: 'update', id: 'r00001', set: { x: 40, y: 50 } }]))
    expect(findNode(r.doc, 'r00001')!.node.x).toBeUndefined()
    expect(r.fixes[0]).toContain('x/y ignorés')
  })
})
