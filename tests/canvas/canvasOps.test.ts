import { describe, it, expect } from 'vitest'
import { applyOps, type Measure } from '../../src/core/ops'
import { findNode } from '../../src/core/tree'
import type { FrameNode, MaquetteDocument, Node } from '../../src/core/types'
import { addAutoLayoutOps, deleteOps, duplicateOps, nudgeOps, wrapInFrameOps, zOrderOps } from '../../src/renderer/canvas/canvasOps'
import { docWith, frame, rect, text } from '../core/helpers'

function run(doc: MaquetteDocument, built: { ops: Parameters<typeof applyOps>[1]; select: string[] }, measure?: Measure) {
  const r = applyOps(doc, built.ops, { measure })
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  const select = built.select.map((id) => (id.startsWith('$') ? r.ids[id]! : id))
  return { doc: r.doc, select }
}
const ids = (list: Node[]) => list.map((n) => n.id)

describe('commandes du canevas', () => {
  it('supprimer ignore un enfant dont le parent est aussi supprimé', () => {
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    f.children.push(text('T1'))
    const base = docWith([f, rect('R1', { x: 0, y: 0 })])
    const { doc } = run(base, deleteOps(base, ['T1', 'F1', 'R1']))
    expect(doc.pages[0]!.children).toEqual([])
  })

  it('dupliquer hors flux : décalé de 10, sous-arbre copié, nouvelle sélection', () => {
    const f = frame('F1', { x: 20, y: 30, layout: { mode: 'auto' } }) as FrameNode
    f.children.push(text('T1', { content: 'Bonjour' }))
    const base = docWith([f])
    const { doc, select } = run(base, duplicateOps(base, ['F1']))
    const copy = findNode(doc, select[0]!)!.node as FrameNode
    expect(copy).toMatchObject({ x: 30, y: 40 })
    expect(copy.children[0]).toMatchObject({ content: 'Bonjour' })
    expect(copy.id).not.toBe('F1')
  })

  it('dupliquer en flux : juste après l’original', () => {
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    f.children.push(text('T1'), text('T2'))
    const base = docWith([f])
    const { doc, select } = run(base, duplicateOps(base, ['T1']))
    expect(ids((findNode(doc, 'F1')!.node as FrameNode).children)).toEqual(['T1', select[0], 'T2'])
  })

  it('encadrer deux éléments posés sur la page', () => {
    const base = docWith([rect('R1', { x: 10, y: 10, width: 50, height: 50 }), rect('R2', { x: 100, y: 10, width: 50, height: 50 })])
    const { doc, select } = run(base, wrapInFrameOps(base, ['R1', 'R2'], () => undefined))
    const f = findNode(doc, select[0]!)!.node as FrameNode
    expect(f).toMatchObject({ x: 10, y: 10, width: 140, height: 50, fills: [] })
    expect(f.children.map((c) => [c.id, c.x, c.y])).toEqual([['R1', 0, 0], ['R2', 90, 0]])
  })

  it('encadrer dans un cadre automatique : cadre automatique hug, ordre gardé', () => {
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto', direction: 'row' } }) as FrameNode
    f.children.push(rect('A'), rect('B'), rect('C'))
    const base = docWith([f])
    const { doc, select } = run(base, wrapInFrameOps(base, ['C', 'B'], () => undefined))
    const parent = findNode(doc, 'F1')!.node as FrameNode
    expect(ids(parent.children)).toEqual(['A', select[0]])
    const w = parent.children[1] as FrameNode
    expect(w).toMatchObject({ width: { mode: 'hug' }, height: { mode: 'hug' }, layout: { mode: 'auto', direction: 'row' } })
    expect(ids(w.children)).toEqual(['B', 'C'])
  })

  it('Maj+A sur un cadre libre : direction, ordre, espacement et marges déduits', () => {
    const f = frame('F1', { x: 0, y: 0, width: 300, height: 100 }) as FrameNode
    f.children.push(rect('B', { x: 80, y: 20, width: 50, height: 40 }), rect('A', { x: 10, y: 20, width: 50, height: 40 }))
    const base = docWith([f])
    const { doc } = run(base, addAutoLayoutOps(base, ['F1'], () => undefined))
    const out = findNode(doc, 'F1')!.node as FrameNode
    expect(out.layout).toMatchObject({ mode: 'auto', direction: 'row', gap: 20, padding: [20, 10, 20, 10] })
    expect(out).toMatchObject({ width: { mode: 'hug' }, height: { mode: 'hug' } })
    expect(ids(out.children)).toEqual(['A', 'B'])
  })

  it('Maj+A sur des éléments : les encadre dans un cadre automatique', () => {
    const base = docWith([rect('R1', { x: 0, y: 0, width: 50, height: 50 }), rect('R2', { x: 0, y: 80, width: 50, height: 50 })])
    const { doc, select } = run(base, addAutoLayoutOps(base, ['R1', 'R2'], () => undefined))
    const f = findNode(doc, select[0]!)!.node as FrameNode
    expect(f.layout).toMatchObject({ mode: 'auto', direction: 'column', gap: 30 })
    expect(ids(f.children)).toEqual(['R1', 'R2'])
  })

  it('ordre d’empilement', () => {
    const base = docWith([rect('A', { x: 0, y: 0 }), rect('B', { x: 0, y: 0 }), rect('C', { x: 0, y: 0 })])
    expect(ids(run(base, zOrderOps(base, ['A'], 'forward')).doc.pages[0]!.children)).toEqual(['B', 'A', 'C'])
    expect(ids(run(base, zOrderOps(base, ['A'], 'front')).doc.pages[0]!.children)).toEqual(['B', 'C', 'A'])
    expect(ids(run(base, zOrderOps(base, ['C'], 'back')).doc.pages[0]!.children)).toEqual(['C', 'A', 'B'])
    expect(ids(run(base, zOrderOps(base, ['A', 'B'], 'front')).doc.pages[0]!.children)).toEqual(['C', 'A', 'B'])
  })

  it('flèches : déplacement hors flux, changement de rang en flux', () => {
    const base = docWith([rect('R1', { x: 5, y: 5 })])
    expect(findNode(run(base, nudgeOps(base, ['R1'], 10, -1)).doc, 'R1')!.node).toMatchObject({ x: 15, y: 4 })
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto', direction: 'row' } }) as FrameNode
    f.children.push(rect('A'), rect('B'))
    const b2 = docWith([f])
    expect(ids((findNode(run(b2, nudgeOps(b2, ['A'], 1, 0)).doc, 'F1')!.node as FrameNode).children)).toEqual(['B', 'A'])
    expect(nudgeOps(b2, ['A'], 0, 1).ops).toEqual([])
  })

  it('encadrer un enfant « fill » : le cadre remplit aussi, il ne retombe pas à 100 px', () => {
    const f = frame('F1', { x: 0, y: 0, width: 500, layout: { mode: 'auto', direction: 'column' } }) as FrameNode
    f.children.push(rect('A', { width: { mode: 'fill' }, height: 40 }), rect('B', { width: 80, height: 40 }))
    const base = docWith([f])
    const measure: Measure = (id) => (id === 'A' ? { x: 0, y: 0, width: 500, height: 40 } : undefined)
    const { doc, select } = run(base, wrapInFrameOps(base, ['A'], measure), measure)
    expect(findNode(doc, select[0]!)!.node).toMatchObject({ width: { mode: 'fill' }, height: { mode: 'hug' } })
    const both = run(base, wrapInFrameOps(base, ['A', 'B'], measure), measure)
    expect(findNode(both.doc, both.select[0]!)!.node).toMatchObject({ width: 500 })
  })
})
