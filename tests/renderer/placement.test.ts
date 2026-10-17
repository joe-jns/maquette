import { describe, expect, it } from 'vitest'
import { placeMenu, placeSubmenu, placeTooltip } from '../../src/renderer/ui/placement'
import { TOOLTIP_DELAY, tooltipDelay } from '../../src/renderer/ui/tooltipTiming'

const vp = { width: 1000, height: 800 }
const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h })

describe('placeTooltip', () => {
  it('dessous par défaut, centrée, à 6 px de la cible', () => {
    const p = placeTooltip(box(100, 100, 24, 24), { width: 60, height: 24 }, vp)
    expect(p).toEqual({ left: 82, top: 130, side: 'bottom', arrowX: 30 })
  })

  it('au-dessus quand on le demande (barre d’outils du bas)', () => {
    const p = placeTooltip(box(500, 740, 32, 32), { width: 80, height: 24 }, vp, 'top')
    expect(p.side).toBe('top')
    expect(p.top).toBe(740 - 6 - 24)
  })

  it('passe de l’autre côté si elle sortirait de la fenêtre', () => {
    expect(placeTooltip(box(500, 770, 24, 24), { width: 60, height: 24 }, vp).side).toBe('top')
    expect(placeTooltip(box(500, 2, 24, 24), { width: 60, height: 24 }, vp, 'top').side).toBe('bottom')
  })

  it('reste dans la fenêtre au bord ; la pointe vise la cible autant que possible', () => {
    const left = placeTooltip(box(0, 100, 20, 20), { width: 120, height: 24 }, vp)
    expect(left.left).toBe(6)
    expect(left.arrowX).toBe(8) // centre de la cible (10) – 6, ramené au coin arrondi
    const right = placeTooltip(box(990, 100, 10, 20), { width: 120, height: 24 }, vp)
    expect(right.left).toBe(1000 - 6 - 120)
    expect(right.arrowX).toBe(120 - 8) // cible tout au bord : pointe ramenée au coin arrondi
  })
})

describe('placeMenu', () => {
  it('en bas à droite du clic', () => {
    expect(placeMenu({ x: 200, y: 150 }, { width: 220, height: 300 }, vp)).toEqual({ left: 200, top: 150 })
  })

  it('retourné à gauche et vers le haut près des bords', () => {
    expect(placeMenu({ x: 900, y: 700 }, { width: 220, height: 300 }, vp)).toEqual({ left: 680, top: 400 })
  })

  it('jamais hors de la fenêtre, même trop haut', () => {
    expect(placeMenu({ x: 100, y: 100 }, { width: 220, height: 900 }, vp)).toEqual({ left: 100, top: 8 })
  })
})

describe('placeSubmenu', () => {
  const parent = box(300, 100, 220, 400)
  it('à droite du parent, première rangée alignée sur la rangée qui l’ouvre', () => {
    expect(placeSubmenu(parent, 260, { width: 160, height: 100 }, vp)).toEqual({ left: 522, top: 252, side: 'right' })
  })

  it('à gauche s’il n’y a pas la place à droite', () => {
    const p = placeSubmenu(box(760, 100, 220, 400), 260, { width: 160, height: 100 }, vp)
    expect(p).toEqual({ left: 760 - 2 - 160, top: 252, side: 'left' })
  })

  it('remonté pour tenir en bas de la fenêtre', () => {
    expect(placeSubmenu(parent, 760, { width: 160, height: 100 }, vp).top).toBe(800 - 8 - 100)
  })
})

describe('tooltipDelay', () => {
  it('500 ms la première fois', () => {
    expect(tooltipDelay(1000, false, null)).toBe(TOOLTIP_DELAY)
    expect(TOOLTIP_DELAY).toBe(500)
  })

  it('aussitôt en passant d’un bouton à l’autre, puis de nouveau 500 ms', () => {
    expect(tooltipDelay(1000, true, null)).toBe(0)
    expect(tooltipDelay(1200, false, 1000)).toBe(0)
    expect(tooltipDelay(1400, false, 1000)).toBe(TOOLTIP_DELAY)
  })
})
