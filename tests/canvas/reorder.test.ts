import { describe, it, expect } from 'vitest'
import { insertionIndex, insertionMarker } from '../../src/renderer/canvas/reorder'

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

describe('point d’insertion', () => {
  const col = [r(0, 0, 100, 20), r(0, 30, 100, 20), r(0, 60, 100, 20)]

  it('colonne', () => {
    expect(insertionIndex(col, 'column', { x: 50, y: 5 })).toBe(0)
    expect(insertionIndex(col, 'column', { x: 50, y: 25 })).toBe(1)
    expect(insertionIndex(col, 'column', { x: 50, y: 45 })).toBe(2)
    expect(insertionIndex(col, 'column', { x: 50, y: 200 })).toBe(3)
  })

  it('ligne : seul l’axe principal compte sans retour à la ligne', () => {
    const row = [r(0, 0, 20, 20), r(30, 0, 20, 20)]
    expect(insertionIndex(row, 'row', { x: 35, y: 0 })).toBe(1)
    expect(insertionIndex(row, 'row', { x: 100, y: 500 })).toBe(2)
    expect(insertionIndex(row, 'row', { x: -5, y: 500 })).toBe(0)
  })

  it('ligne avec retour à la ligne', () => {
    const rows = [r(0, 0, 20, 20), r(30, 0, 20, 20), r(0, 30, 20, 20)]
    expect(insertionIndex(rows, 'row', { x: 5, y: 35 }, true)).toBe(2)
    expect(insertionIndex(rows, 'row', { x: 45, y: 5 }, true)).toBe(2)
    expect(insertionIndex(rows, 'row', { x: 25, y: 10 }, true)).toBe(1)
  })

  it('liste vide', () => {
    expect(insertionIndex([], 'column', { x: 0, y: 0 })).toBe(0)
  })

  it('trait d’insertion entre deux enfants d’une colonne', () => {
    expect(insertionMarker(col, 'column', 1, r(0, 0, 100, 80))).toEqual({ x1: 0, y1: 25, x2: 100, y2: 25 })
    expect(insertionMarker(col, 'column', 0, r(0, -10, 100, 90))).toEqual({ x1: 0, y1: -10, x2: 100, y2: -10 })
    expect(insertionMarker(col, 'column', 3, r(0, 0, 100, 90))).toEqual({ x1: 0, y1: 90, x2: 100, y2: 90 })
  })
})
