import { describe, it, expect } from 'vitest'
import { applyOps, type Op } from '../../src/core/ops'
import { findNode, walk } from '../../src/core/tree'
import type { FrameNode, MaquetteDocument, Node, TextNode } from '../../src/core/types'
import { duplicateOps } from '../../src/renderer/canvas/canvasOps'
import { copyNodes, pasteOps } from '../../src/renderer/canvas/clipboard'
import { docWith, frame, text } from '../core/helpers'

const run = (doc: MaquetteDocument, ops: Op[]) => {
  const r = applyOps(doc, ops)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r
}
const get = (doc: MaquetteDocument, id: string) => findNode(doc, id)!.node as FrameNode

/** Principal « Carte » (titre) et une instance dont le titre est surchargé. */
function setup() {
  const card = frame('card01', { x: 0, y: 0, name: 'Carte', layout: { mode: 'auto' }, width: 200, height: { mode: 'hug' }, component: true }) as FrameNode
  card.children = [text('ttl001', { content: 'Titre' })]
  const doc = docWith([card])
  const r = run(doc, [{ op: 'create', parent: doc.pages[0]!.id, node: { id: '$i', type: 'frame', instanceOf: 'card01', x: 300, y: 0 } }])
  const inst = r.ids.$i!
  const label = get(r.doc, inst).children[0]!.id
  const r2 = run(r.doc, [{ op: 'update', id: label, set: { content: 'Local' } }])
  return { doc: r2.doc, inst }
}

const instancesOf = (doc: MaquetteDocument, main: string) => {
  const out: FrameNode[] = []
  walk(doc, ({ node }) => {
    if (node.type === 'frame' && node.instanceOf === main && node.source === undefined) out.push(node)
  })
  return out
}

describe('copier, coller, dupliquer des composants', () => {
  it('dupliquer un principal crée une instance', () => {
    const { doc } = setup()
    const r = run(doc, duplicateOps(doc, ['card01']).ops)
    expect(instancesOf(r.doc, 'card01')).toHaveLength(2)
    const copy = instancesOf(r.doc, 'card01').find((n) => n.x === 10)!
    expect(copy.component).toBeUndefined()
    expect((copy.children[0] as TextNode).content).toBe('Titre')
  })

  it('dupliquer ou coller une instance garde ses surcharges', () => {
    const { doc, inst } = setup()
    const dup = run(doc, duplicateOps(doc, [inst]).ops)
    const pasted = run(doc, pasteOps(doc, copyNodes(doc, [inst]), { parent: doc.pages[0]!.id, at: { x: 0, y: 500 } }).ops)
    for (const d of [dup.doc, pasted.doc]) {
      const copies = instancesOf(d, 'card01').filter((n) => n.id !== inst)
      expect(copies).toHaveLength(1)
      expect(copies[0]!.children[0]).toMatchObject({ content: 'Local', overrides: ['content'], source: 'ttl001' })
    }
  })

  it('coller dans un document sans le principal : copie détachée ; un principal reste principal', () => {
    const { doc, inst } = setup()
    const other = docWith([])
    const payload = copyNodes(doc, [inst, 'card01'])
    const r = run(other, pasteOps(other, payload, { parent: other.pages[0]!.id }).ops)
    const nodes: Node[] = []
    walk(r.doc, ({ node }) => nodes.push(node))
    expect(nodes.every((n) => n.source === undefined && n.overrides === undefined)).toBe(true)
    expect(nodes.filter((n) => n.type === 'frame' && n.component)).toHaveLength(1)
    expect(nodes.some((n) => n.type === 'text' && n.content === 'Local')).toBe(true)
  })

  it('coller une instance dans son propre principal est refusé (boucle)', () => {
    const { doc, inst } = setup()
    const r = applyOps(doc, pasteOps(doc, copyNodes(doc, [inst]), { parent: 'card01' }).ops)
    expect(r.ok).toBe(false)
  })
})
