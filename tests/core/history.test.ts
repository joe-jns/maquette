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
