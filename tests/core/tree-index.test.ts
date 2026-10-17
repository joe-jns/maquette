import { describe, expect, it } from 'vitest'
import { freeze } from 'immer'
import { applyOps } from '../../src/core/ops'
import { collectIds, findNode, walk } from '../../src/core/tree'
import type { FrameNode, MaquetteDocument } from '../../src/core/types'
import { docWith, frame, rect, text } from './helpers'

/** Document gelé (comme ceux d'Immer et de `load`) : findNode passe par l'index. */
function frozenDoc(): MaquetteDocument {
  const card = frame('f00002', { x: 10, y: 10, layout: { mode: 'auto' } }) as FrameNode
  card.children.push(text('t00001'), rect('r00002'))
  const section = frame('f00001', { x: 0, y: 0 }) as FrameNode
  section.children.push(card, rect('r00001', { x: 5, y: 5 }))
  return freeze(docWith([section, rect('r00003', { x: 400, y: 0 })]), true)
}

/** Référence : l'ancien parcours complet, sans index. */
function expected(doc: MaquetteDocument) {
  const out = new Map<string, { node: unknown; parent: string | null; page: string; index: number; path: string }>()
  walk(doc, ({ node, parent, page, index, path }) => {
    if (!out.has(node.id)) out.set(node.id, { node, parent: parent?.id ?? null, page: page.id, index, path })
  })
  return out
}

function expectConsistent(doc: MaquetteDocument) {
  for (const [id, ref] of expected(doc)) {
    const loc = findNode(doc, id)
    expect(loc, id).not.toBeNull()
    expect(loc!.node).toBe(ref.node)
    expect(loc!.parent?.id ?? null).toBe(ref.parent)
    expect(loc!.page.id).toBe(ref.page)
    expect(loc!.index).toBe(ref.index)
    expect(loc!.path).toBe(ref.path)
  }
}

describe('index identifiant → élément', () => {
  it('donne le même emplacement que le parcours complet (nœud, parent, page, rang, chemin)', () => {
    const doc = frozenDoc()
    expectConsistent(doc)
    expect(findNode(doc, 'absent')).toBeNull()
  })

  it('reste juste après chaque opération (nouvelle version du document)', () => {
    let doc = frozenDoc()
    const steps = [
      [{ op: 'update' as const, id: 'r00001', set: { x: 42 } }],
      [{ op: 'create' as const, parent: 'f00002', index: 0, node: { id: '$n', type: 'shape' as const } }],
      [{ op: 'move' as const, id: 'r00003', parent: 'f00001', x: 1, y: 2 }],
      [{ op: 'delete' as const, id: 't00001' }],
      [{ op: 'page.create' as const, name: 'Deux' }],
    ]
    for (const ops of steps) {
      const before = doc
      const r = applyOps(doc, ops)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      doc = r.doc
      expectConsistent(doc)
      // L'ancienne version garde son propre index, intact.
      expectConsistent(before)
    }
    expect(findNode(doc, 't00001')).toBeNull()
    expect(findNode(doc, 'r00003')?.parent?.id).toBe('f00001')
    expect(findNode(doc, 'r00001')?.node.x).toBe(42)
  })

  it('ne mélange pas deux documents différents qui partagent des identifiants', () => {
    const a = frozenDoc()
    const b = freeze(docWith([rect('r00001', { x: 9, y: 9 })]), true)
    expect(findNode(a, 'r00001')?.parent?.id).toBe('f00001')
    expect(findNode(b, 'r00001')?.parent).toBeNull()
    expect(findNode(b, 'f00001')).toBeNull()
    expect(findNode(a, 'r00001')?.node).not.toBe(findNode(b, 'r00001')?.node)
  })

  it('un document non gelé n’est jamais indexé : une modification en place est vue tout de suite', () => {
    const doc = docWith([rect('r00001', { x: 0, y: 0 })])
    expect(findNode(doc, 'r00001')?.index).toBe(0)
    doc.pages[0]!.children.unshift(rect('r00009', { x: 0, y: 0 }))
    expect(findNode(doc, 'r00001')?.index).toBe(1)
    expect(findNode(doc, 'r00009')?.index).toBe(0)
  })

  it('collectIds d’un document indexé rend une copie modifiable, complète', () => {
    const doc = frozenDoc()
    const ids = collectIds(doc)
    expect([...ids].sort()).toEqual(
      [doc.pages[0]!.id, 'f00001', 'f00002', 't00001', 'r00001', 'r00002', 'r00003'].sort(),
    )
    ids.add('zzz')
    expect(collectIds(doc).has('zzz')).toBe(false)
  })
})
