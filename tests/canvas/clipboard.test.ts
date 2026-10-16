import { describe, it, expect } from 'vitest'
import { applyOps } from '../../src/core/ops'
import { findNode } from '../../src/core/tree'
import type { FrameNode } from '../../src/core/types'
import { copyNodes, parseClipboard, pasteOps } from '../../src/renderer/canvas/clipboard'
import { docWith, frame, rect, text } from '../core/helpers'

describe('presse-papiers', () => {
  it('copier puis coller un sous-arbre à un point donné', () => {
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    f.children.push(text('T1', { content: 'Salut' }))
    const doc = docWith([f])
    const payload = copyNodes(doc, ['F1'])
    expect(payload.format).toBe('maquette-clipboard')
    const built = pasteOps(doc, payload, { parent: doc.pages[0]!.id, at: { x: 300, y: 40 } })
    const r = applyOps(doc, built.ops)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    const pasted = findNode(r.doc, r.ids[built.select[0]!]!)!.node as FrameNode
    expect(pasted).toMatchObject({ x: 300, y: 40 })
    expect(pasted.children[0]).toMatchObject({ content: 'Salut' })
  })

  it('plusieurs éléments gardent leurs positions relatives', () => {
    const doc = docWith([rect('R1', { x: 10, y: 10 }), rect('R2', { x: 100, y: 10 })])
    const built = pasteOps(doc, copyNodes(doc, ['R1', 'R2']), { parent: doc.pages[0]!.id, at: { x: 0, y: 0 } })
    const r = applyOps(doc, built.ops)
    if (!r.ok) throw new Error('échec')
    const [a, b] = built.select.map((t) => findNode(r.doc, r.ids[t]!)!.node)
    expect([a!.x, a!.y, b!.x, b!.y]).toEqual([0, 0, 90, 0])
  })

  it('coller dans un cadre automatique : en flux, à la fin', () => {
    const f = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
    f.children.push(rect('A'))
    const doc = docWith([f, rect('R1', { x: 400, y: 0 })])
    const built = pasteOps(doc, copyNodes(doc, ['R1']), { parent: 'F1' })
    const r = applyOps(doc, built.ops)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    const children = (findNode(r.doc, 'F1')!.node as FrameNode).children
    expect(children).toHaveLength(2)
    expect(children[1]!.x).toBeUndefined()
  })

  it('un style absent du document de destination est remplacé par sa valeur', () => {
    const src = docWith([rect('R1', { x: 0, y: 0, fills: [{ style: 'cFond1' }] })])
    src.styles.colors.push({ id: 'cFond1', name: 'fond', value: '#F4F1EA' })
    const dest = docWith([])
    const built = pasteOps(dest, copyNodes(src, ['R1']), { parent: dest.pages[0]!.id })
    const r = applyOps(dest, built.ops)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    const n = r.doc.pages[0]!.children[0]!
    expect(n.type === 'shape' && n.fills).toEqual(['#F4F1EA'])
  })

  it('parseClipboard ne reconnaît que le format Maquette', () => {
    const doc = docWith([rect('R1', { x: 0, y: 0 })])
    expect(parseClipboard(JSON.stringify(copyNodes(doc, ['R1'])))).not.toBeNull()
    expect(parseClipboard('bonjour')).toBeNull()
    expect(parseClipboard('{"format":"autre"}')).toBeNull()
  })
})
