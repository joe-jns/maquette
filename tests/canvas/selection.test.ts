import { describe, it, expect } from 'vitest'
import { ascend, contextOf, descend, marqueeSelect, nextSibling, pickClickTarget } from '../../src/renderer/canvas/selection'
import type { FrameNode, Rect } from '../../src/core/types'
import { docWith, frame, rect, text } from '../core/helpers'

function build() {
  const f2 = frame('F2', { layout: { mode: 'auto' }, width: 100, height: 100 }) as FrameNode
  f2.children.push(text('T2'))
  const f1 = frame('F1', { x: 0, y: 0, layout: { mode: 'auto' } }) as FrameNode
  f1.children.push(text('T1'), f2)
  return docWith([f1, rect('R1', { x: 500, y: 0 })])
}

describe('règles de sélection', () => {
  const doc = build()

  it('un clic sélectionne l’élément de premier niveau du contexte', () => {
    expect(pickClickTarget(doc, 'T2', { deep: false, context: null })).toBe('F1')
    expect(pickClickTarget(doc, 'T2', { deep: false, context: 'F1' })).toBe('F2')
    expect(pickClickTarget(doc, 'T2', { deep: false, context: 'F2' })).toBe('T2')
    expect(pickClickTarget(doc, 'R1', { deep: false, context: 'F2' })).toBe('R1')
  })

  it('Ctrl+clic : l’élément le plus profond, sauf s’il recouvre tout son parent', () => {
    expect(pickClickTarget(doc, 'T2', { deep: true, context: null })).toBe('T2')
    const rects: Record<string, Rect> = { T2: { x: 0, y: 0, width: 100, height: 100 }, F2: { x: 0, y: 0, width: 100, height: 100 } }
    expect(pickClickTarget(doc, 'T2', { deep: true, context: null, rectOf: (id) => rects[id] })).toBe('F2')
  })

  it('contexte, descendre, remonter, frère suivant', () => {
    expect(contextOf(doc, 'T2')).toBe('F2')
    expect(contextOf(doc, 'F1')).toBeNull()
    expect(descend(doc, 'F1')).toBe('T1')
    expect(descend(doc, 'T1')).toBeNull()
    expect(ascend(doc, 'T2')).toBe('F2')
    expect(ascend(doc, 'F1')).toBeNull()
    expect(nextSibling(doc, 'T1', 1)).toBe('F2')
    expect(nextSibling(doc, 'F2', 1)).toBe('T1')
    expect(nextSibling(doc, 'T1', -1)).toBe('F2')
  })

  it('lasso : éléments du contexte qui intersectent', () => {
    const rects: Record<string, Rect> = {
      F1: { x: 0, y: 0, width: 400, height: 300 }, R1: { x: 500, y: 0, width: 100, height: 100 },
      T1: { x: 0, y: 0, width: 50, height: 20 }, F2: { x: 0, y: 30, width: 100, height: 100 },
    }
    const pageId = doc.pages[0]!.id
    expect(marqueeSelect(doc, pageId, null, (id) => rects[id], { x: 450, y: -10, width: 200, height: 50 })).toEqual(['R1'])
    expect(marqueeSelect(doc, pageId, null, (id) => rects[id], { x: -10, y: -10, width: 1000, height: 50 })).toEqual(['F1', 'R1'])
    expect(marqueeSelect(doc, pageId, 'F1', (id) => rects[id], { x: -10, y: 25, width: 30, height: 10 })).toEqual(['F2'])
  })
})
