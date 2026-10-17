import { describe, expect, it } from 'vitest'
import { edgeIndex, matchIndex, placeList, stepIndex } from '../../src/renderer/ui/listNav'

const items = [
  { label: 'Thin' },
  { label: 'Light', disabled: true },
  { label: 'Regular' },
  { label: 'Bold' },
  { label: 'Black' },
  { label: 'Écart' },
]

describe('navigation d’une liste', () => {
  it('↑ ↓ sautent les options grisées et ne bouclent pas', () => {
    expect(stepIndex(items, 0, 1)).toBe(2)
    expect(stepIndex(items, 2, -1)).toBe(0)
    expect(stepIndex(items, 5, 1)).toBe(5)
    expect(stepIndex(items, 0, -1)).toBe(0)
    expect(stepIndex(items, -1, 1)).toBe(0)
    expect(stepIndex(items, -1, -1)).toBe(5)
  })

  it('début et fin ignorent les options grisées', () => {
    expect(edgeIndex([{ label: 'a', disabled: true }, { label: 'b' }], 'first')).toBe(1)
    expect(edgeIndex([{ label: 'a' }, { label: 'b', disabled: true }], 'last')).toBe(0)
    expect(edgeIndex([{ label: 'a', disabled: true }], 'first')).toBe(-1)
  })

  it('lettres : saut au libellé, répétition = suivante, sans casse ni accents, grisées ignorées', () => {
    expect(matchIndex(items, 'b', 0)).toBe(3)
    expect(matchIndex(items, 'b', 3)).toBe(4)
    expect(matchIndex(items, 'bb', 4)).toBe(3)
    expect(matchIndex(items, 'bl', 3)).toBe(4)
    expect(matchIndex(items, 'bo', 3)).toBe(3)
    expect(matchIndex(items, 'L', 0)).toBe(-1)
    expect(matchIndex(items, 'e', 0)).toBe(5)
    expect(matchIndex(items, 'z', 0)).toBe(-1)
  })
})

describe('placement de la liste', () => {
  const viewport = { width: 1000, height: 800 }
  const anchor = { left: 800, top: 300, width: 100, height: 24 }

  it('option choisie posée sur le champ', () => {
    const p = placeList(anchor, { width: 160, height: 200 }, 60, viewport)
    expect(p.top).toBe(300 + 12 - 60)
    expect(p.left).toBe(800)
  })

  it('sous le champ sans option choisie', () => {
    expect(placeList(anchor, { width: 160, height: 200 }, null, viewport).top).toBe(328)
  })

  it('reste dans la fenêtre : bord droit, haut, bas, liste trop haute', () => {
    const right = placeList({ ...anchor, left: 950 }, { width: 160, height: 100 }, null, viewport)
    expect(right.left).toBe(1000 - 8 - 160)
    expect(placeList({ ...anchor, top: 10 }, { width: 100, height: 200 }, 180, viewport).top).toBe(8)
    expect(placeList({ ...anchor, top: 780 }, { width: 100, height: 200 }, null, viewport).top).toBe(800 - 8 - 200)
    const tall = placeList(anchor, { width: 100, height: 2000 }, 1000, viewport)
    expect(tall).toMatchObject({ top: 8, maxHeight: 784 })
  })
})
