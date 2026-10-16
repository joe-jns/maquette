import { describe, it, expect } from 'vitest'
import { center, contains, distanceLines, intersects, normalizeRect, union } from '../../src/renderer/canvas/geometry'

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

describe('géométrie', () => {
  it('union', () => {
    expect(union([r(0, 0, 10, 10), r(20, 5, 10, 10)])).toEqual(r(0, 0, 30, 15))
    expect(union([])).toBeNull()
  })

  it('intersection et inclusion', () => {
    expect(intersects(r(0, 0, 10, 10), r(5, 5, 10, 10))).toBe(true)
    expect(intersects(r(0, 0, 10, 10), r(10, 0, 10, 10))).toBe(false)
    expect(contains(r(0, 0, 100, 100), r(10, 10, 20, 20))).toBe(true)
    expect(contains(r(0, 0, 100, 100), r(90, 10, 20, 20))).toBe(false)
    expect(contains(r(0, 0, 100, 100), r(0, 0, 100.4, 100), 0.5)).toBe(true)
  })

  it('rectangle depuis deux points, centre', () => {
    expect(normalizeRect({ x: 10, y: 10 }, { x: 0, y: 20 })).toEqual(r(0, 10, 10, 10))
    expect(center(r(0, 10, 10, 20))).toEqual({ x: 5, y: 20 })
  })

  it('distance entre deux éléments côte à côte', () => {
    expect(distanceLines(r(0, 0, 10, 10), r(30, 0, 10, 10))).toEqual([{ x1: 10, y1: 5, x2: 30, y2: 5, length: 20 }])
  })

  it('distances aux bords du parent', () => {
    expect(distanceLines(r(10, 10, 10, 10), r(0, 0, 40, 40)).map((l) => l.length)).toEqual([10, 20, 10, 20])
  })
})
