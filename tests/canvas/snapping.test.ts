import { describe, it, expect } from 'vitest'
import { snapMove, snapValue } from '../../src/renderer/canvas/snapping'

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

describe('magnétisme', () => {
  const target = [r(100, 0, 50, 50)]

  it('bord contre bord à moins du seuil', () => {
    const s = snapMove(r(153, 200, 20, 20), target, 5)
    expect(s.dx).toBe(-3)
    expect(s.dy).toBe(0)
    expect(s.guides.some((g) => g.axis === 'x' && g.at === 150)).toBe(true)
  })

  it('centre contre centre', () => {
    expect(snapMove(r(113, 200, 20, 20), target, 5).dx).toBe(2)
  })

  it('au-delà du seuil : rien', () => {
    const s = snapMove(r(160, 200, 20, 20), target, 5)
    expect(s.dx).toBe(0)
    expect(s.guides).toEqual([])
  })

  it('axe vertical', () => {
    const s = snapMove(r(400, 52, 20, 20), target, 5)
    expect(s.dy).toBe(-2)
    expect(s.guides.some((g) => g.axis === 'y' && g.at === 50)).toBe(true)
  })

  it('espacement égal à la suite d’une paire', () => {
    const s = snapMove(r(82, 0, 20, 20), [r(0, 0, 20, 20), r(40, 0, 20, 20)], 5)
    expect(s.dx).toBe(-2)
    expect(s.gaps.length).toBeGreaterThanOrEqual(2)
  })

  it('espacement égal entre deux voisins', () => {
    expect(snapMove(r(49, 0, 20, 20), [r(0, 0, 20, 20), r(100, 0, 20, 20)], 5).dx).toBe(1)
  })

  it('le plus petit décalage gagne', () => {
    expect(snapMove(r(148, 300, 20, 20), [r(100, 0, 50, 50), r(0, 0, 147, 10)], 5).dx).toBe(-1)
  })

  it('snapValue pour un bord redimensionné', () => {
    expect(snapValue(203, [100, 200, 300], 5)).toEqual({ value: 200, snapped: 200 })
    expect(snapValue(250, [100, 200, 300], 5)).toEqual({ value: 250, snapped: null })
  })
})

describe('magnétisme : cas limites', () => {
  it('aucune cible : aucun décalage ni guide', () => {
    expect(snapMove(r(10, 10, 20, 20), [], 5)).toEqual({ dx: 0, dy: 0, guides: [], gaps: [] })
  })

  it('cible identique à l’élément : reste en place, guides sur les deux axes', () => {
    const s = snapMove(r(10, 10, 20, 20), [r(10, 10, 20, 20)], 5)
    expect(s.dx).toBe(0)
    expect(s.dy).toBe(0)
    expect(s.guides.filter((g) => g.axis === 'x').map((g) => g.at).sort((a, b) => a - b)).toEqual([10, 20, 30])
    expect(s.guides.filter((g) => g.axis === 'y').map((g) => g.at).sort((a, b) => a - b)).toEqual([10, 20, 30])
  })

  it('seuil 0 : seul un alignement exact compte', () => {
    expect(snapMove(r(151, 200, 20, 20), [r(100, 0, 50, 50)], 0).dx).toBe(0)
    expect(snapMove(r(151, 200, 20, 20), [r(100, 0, 50, 50)], 0).guides).toEqual([])
    expect(snapMove(r(150, 200, 20, 20), [r(100, 0, 50, 50)], 0).guides.some((g) => g.at === 150)).toBe(true)
  })

  it('le guide couvre l’élément et la cible', () => {
    const s = snapMove(r(153, 200, 20, 20), [r(100, 0, 50, 50)], 5)
    expect(s.guides.find((g) => g.axis === 'x' && g.at === 150)).toEqual({ axis: 'x', at: 150, from: 0, to: 220 })
  })

  it('à égalité, un bord l’emporte sur un espacement', () => {
    // Espacement égal à la suite de la paire : 80 → +2 ; bord gauche de la cible lointaine : 76 → −2.
    const s = snapMove(r(78, 0, 20, 20), [r(0, 0, 20, 20), r(40, 0, 20, 20), r(76, 500, 10, 10)], 5)
    expect(s.dx).toBe(-2)
    expect(s.gaps).toEqual([])
  })

  it('les écarts égaux sont décrits à la position finale', () => {
    const s = snapMove(r(82, 0, 20, 20), [r(0, 0, 20, 20), r(40, 0, 20, 20)], 5)
    expect(s.gaps).toContainEqual({ axis: 'x', from: 20, to: 40, at: 10 })
    expect(s.gaps).toContainEqual({ axis: 'x', from: 60, to: 80, at: 10 })
  })

  it('espacement égal ignoré si les cibles ne recouvrent pas l’élément sur l’autre axe', () => {
    expect(snapMove(r(82, 300, 20, 20), [r(0, 0, 20, 20), r(40, 0, 20, 20)], 5).dx).toBe(0)
  })
})
