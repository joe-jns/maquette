import { describe, expect, it } from 'vitest'
import { applyOps } from '../../src/core/ops'
import { findNode } from '../../src/core/tree'
import type { FrameNode, MaquetteDocument, Rect } from '../../src/core/types'
import { alignOps, canAlign, canDistribute, distributeOps } from '../../src/renderer/canvas/alignOps'
import { docWith, frame, rect, text } from '../core/helpers'

/** Rectangles du monde : la page à l'origine, le cadre F en (100, 100). */
function scene(): { doc: MaquetteDocument; world: Record<string, Rect> } {
  const f = frame('F', { x: 100, y: 100, width: 400, height: 200 }) as FrameNode
  f.children.push(rect('A', { x: 10, y: 20, width: 50, height: 40 }), rect('B', { x: 200, y: 50, width: 100, height: 20 }))
  const auto = frame('Auto', { x: 0, y: 600, layout: { mode: 'auto' } }) as FrameNode
  auto.children.push(text('T'))
  const doc = docWith([f, rect('R', { x: 600, y: 0, width: 30, height: 30 }), auto])
  const world: Record<string, Rect> = {
    F: { x: 100, y: 100, width: 400, height: 200 },
    A: { x: 110, y: 120, width: 50, height: 40 },
    B: { x: 300, y: 150, width: 100, height: 20 },
    R: { x: 600, y: 0, width: 30, height: 30 },
    Auto: { x: 0, y: 600, width: 100, height: 40 },
    T: { x: 0, y: 600, width: 60, height: 20 },
  }
  return { doc, world }
}

const pos = (doc: MaquetteDocument, id: string) => {
  const n = findNode(doc, id)!.node
  return { x: n.x, y: n.y }
}

function run(doc: MaquetteDocument, ops: ReturnType<typeof alignOps>) {
  const r = applyOps(doc, ops)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.doc
}

describe('aligner', () => {
  it('un seul élément s’aligne sur son cadre parent', () => {
    const { doc, world } = scene()
    const get = (id: string) => world[id]
    expect(pos(run(doc, alignOps(doc, ['A'], 'right', get)), 'A')).toEqual({ x: 350, y: 20 })
    expect(pos(run(doc, alignOps(doc, ['A'], 'hcenter', get)), 'A')).toEqual({ x: 175, y: 20 })
    expect(pos(run(doc, alignOps(doc, ['A'], 'bottom', get)), 'A')).toEqual({ x: 10, y: 160 })
    expect(pos(run(doc, alignOps(doc, ['A'], 'vcenter', get)), 'A')).toEqual({ x: 10, y: 80 })
  })

  it('plusieurs éléments s’alignent sur leur boîte commune, même de parents différents', () => {
    const { doc, world } = scene()
    const get = (id: string) => world[id]
    const left = run(doc, alignOps(doc, ['A', 'B'], 'left', get))
    expect(pos(left, 'A')).toEqual({ x: 10, y: 20 })
    expect(pos(left, 'B')).toEqual({ x: 10, y: 50 })
    const top = run(doc, alignOps(doc, ['B', 'R'], 'top', get))
    expect(pos(top, 'B')).toEqual({ x: 200, y: -100 })
    expect(pos(top, 'R')).toEqual({ x: 600, y: 0 })
    // Déjà aligné : aucune opération.
    expect(alignOps(doc, ['R'], 'left', get)).toEqual([])
  })

  it('élément seul sur la page, enfant placé par la mise en page automatique : rien à aligner', () => {
    const { doc, world } = scene()
    const get = (id: string) => world[id]
    expect(canAlign(doc, ['R'])).toBe(false)
    expect(alignOps(doc, ['R'], 'left', get)).toEqual([])
    expect(canAlign(doc, ['T'])).toBe(false)
    expect(canAlign(doc, ['A'])).toBe(true)
    expect(canAlign(doc, ['B', 'R'])).toBe(true)
  })

  it('un seul lot : une seule annulation', () => {
    const { doc, world } = scene()
    const ops = alignOps(doc, ['A', 'B'], 'right', (id) => world[id])
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ op: 'update', id: 'A', set: { x: 250 } })
  })
})

describe('répartir', () => {
  it('3 éléments ou plus : extrêmes fixes, écarts égaux', () => {
    const f = frame('F', { x: 0, y: 0, width: 1000, height: 100 }) as FrameNode
    f.children.push(
      rect('A', { x: 0, y: 0, width: 100, height: 10 }),
      rect('B', { x: 150, y: 0, width: 50, height: 10 }),
      rect('C', { x: 700, y: 0, width: 100, height: 10 }),
    )
    const doc = docWith([f])
    const world: Record<string, Rect> = {
      A: { x: 0, y: 0, width: 100, height: 10 },
      B: { x: 150, y: 0, width: 50, height: 10 },
      C: { x: 700, y: 0, width: 100, height: 10 },
    }
    expect(canDistribute(doc, ['A', 'B'])).toBe(false)
    expect(canDistribute(doc, ['A', 'B', 'C'])).toBe(true)
    const out = run(doc, distributeOps(doc, ['C', 'A', 'B'], 'horizontal', (id) => world[id]))
    expect(pos(out, 'A').x).toBe(0)
    expect(pos(out, 'B').x).toBe(375)
    expect(pos(out, 'C').x).toBe(700)
  })
})
