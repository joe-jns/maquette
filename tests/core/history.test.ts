import { describe, it, expect } from 'vitest'
import { History } from '../../src/core/history'
import { applyOps } from '../../src/core/ops'
import type { MaquetteDocument } from '../../src/core/types'
import { docWith, rect } from './helpers'

function edit(doc: MaquetteDocument, name: string, history: History): MaquetteDocument {
  const r = applyOps(doc, [{ op: 'update', id: 'r00001', set: { name } }])
  if (!r.ok) throw new Error('échec')
  history.push({ label: `Renommer en ${name}`, patches: r.patches, inversePatches: r.inversePatches })
  return r.doc
}
const nameOf = (doc: MaquetteDocument) => doc.pages[0]!.children[0]!.name

describe('History', () => {
  it('annule puis rétablit avec les libellés', () => {
    const h = new History()
    let doc = docWith([rect('r00001', { x: 0, y: 0, name: 'A' })])
    doc = edit(doc, 'B', h)
    doc = edit(doc, 'C', h)
    const u = h.undo(doc)!
    expect(u.label).toBe('Renommer en C')
    expect(nameOf(u.doc)).toBe('B')
    const r = h.redo(u.doc)!
    expect(nameOf(r.doc)).toBe('C')
  })

  it('une nouvelle modification efface le futur', () => {
    const h = new History()
    let doc = docWith([rect('r00001', { x: 0, y: 0, name: 'A' })])
    doc = edit(doc, 'B', h)
    doc = h.undo(doc)!.doc
    expect(h.canRedo()).toBe(true)
    edit(doc, 'Z', h)
    expect(h.canRedo()).toBe(false)
  })

  it('ignore les entrées vides et renvoie null quand il n’y a rien à faire', () => {
    const h = new History()
    h.push({ label: 'rien', patches: [], inversePatches: [] })
    expect(h.canUndo()).toBe(false)
    expect(h.undo(docWith([]))).toBeNull()
    expect(h.redo(docWith([]))).toBeNull()
  })

  it('respecte la limite d’entrées', () => {
    const h = new History(2)
    let doc = docWith([rect('r00001', { x: 0, y: 0, name: 'A' })])
    doc = edit(doc, 'B', h)
    doc = edit(doc, 'C', h)
    doc = edit(doc, 'D', h)
    doc = h.undo(doc)!.doc
    doc = h.undo(doc)!.doc
    expect(nameOf(doc)).toBe('B')
    expect(h.canUndo()).toBe(false)
  })
})

describe('History : groupes', () => {
  function editIn(doc: MaquetteDocument, name: string, history: History, group?: string): MaquetteDocument {
    const r = applyOps(doc, [{ op: 'update', id: 'r00001', set: { name } }])
    if (!r.ok) throw new Error('échec')
    history.push({ label: `Renommer en ${name}`, patches: r.patches, inversePatches: r.inversePatches, group })
    return r.doc
  }

  it('fusionne les entrées successives d’un groupe : un undo les annule toutes, un redo les refait', () => {
    const h = new History()
    let doc = docWith([rect('r00001', { x: 0, y: 0, name: 'A' })])
    doc = editIn(doc, 'B', h)
    doc = editIn(doc, 'C', h, 'claude:1')
    doc = editIn(doc, 'D', h, 'claude:1')
    doc = editIn(doc, 'E', h, 'claude:1')
    const u = h.undo(doc)!
    expect(u.label).toBe('Renommer en C')
    expect(nameOf(u.doc)).toBe('B')
    const r = h.redo(u.doc)!
    expect(nameOf(r.doc)).toBe('E')
    expect(nameOf(h.undo(r.doc)!.doc)).toBe('B')
  })

  it('une entrée sans groupe ou d’un autre groupe ferme le groupe', () => {
    const h = new History()
    let doc = docWith([rect('r00001', { x: 0, y: 0, name: 'A' })])
    doc = editIn(doc, 'B', h, 'g1')
    doc = editIn(doc, 'C', h)
    doc = editIn(doc, 'D', h, 'g1')
    doc = editIn(doc, 'E', h, 'g2')
    doc = h.undo(doc)!.doc
    expect(nameOf(doc)).toBe('D')
    doc = h.undo(doc)!.doc
    expect(nameOf(doc)).toBe('C')
    doc = h.undo(doc)!.doc
    expect(nameOf(doc)).toBe('B')
  })

  it('depthOf : entrées au-dessus du groupe, null une fois annulé ; topGroup', () => {
    const h = new History()
    let doc = docWith([rect('r00001', { x: 0, y: 0, name: 'A' })])
    expect(h.depthOf('g1')).toBeNull()
    doc = editIn(doc, 'B', h, 'g1')
    doc = editIn(doc, 'C', h, 'g1')
    expect(h.depthOf('g1')).toBe(0)
    expect(h.topGroup()).toBe('g1')
    doc = editIn(doc, 'D', h)
    doc = editIn(doc, 'E', h, 'g2')
    expect(h.depthOf('g1')).toBe(2)
    expect(h.topGroup()).toBe('g2')
    doc = h.undo(doc)!.doc
    doc = h.undo(doc)!.doc
    doc = h.undo(doc)!.doc
    expect(h.depthOf('g1')).toBeNull()
    expect(nameOf(doc)).toBe('A')
    doc = h.redo(doc)!.doc
    expect(h.depthOf('g1')).toBe(0)
    expect(nameOf(doc)).toBe('C')
  })

  it('une nouvelle entrée du même groupe après un undo ne fusionne pas avec le futur effacé', () => {
    const h = new History()
    let doc = docWith([rect('r00001', { x: 0, y: 0, name: 'A' })])
    doc = editIn(doc, 'B', h)
    doc = editIn(doc, 'C', h, 'g1')
    doc = h.undo(doc)!.doc
    doc = editIn(doc, 'D', h, 'g1')
    expect(h.canRedo()).toBe(false)
    expect(nameOf(h.undo(doc)!.doc)).toBe('B')
  })
})
