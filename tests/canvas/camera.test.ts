import { describe, it, expect } from 'vitest'
import {
  MAX_ZOOM, MIN_ZOOM, clampZoom, fitRect, screenToWorld, stepZoom, wheelPan, wheelZoomFactor, worldToScreen, zoomAt,
} from '../../src/renderer/canvas/camera'

describe('caméra', () => {
  it('conversions écran ↔ monde', () => {
    const c = { x: 100, y: 50, zoom: 2 }
    expect(worldToScreen(c, { x: 10, y: 20 })).toEqual({ x: 120, y: 90 })
    expect(screenToWorld(c, { x: 120, y: 90 })).toEqual({ x: 10, y: 20 })
  })

  it('zoomer garde le point sous le curseur immobile', () => {
    const c = { x: 30, y: -20, zoom: 1 }
    const p = { x: 200, y: 100 }
    const world = screenToWorld(c, p)
    const c2 = zoomAt(c, 2, p)
    expect(c2.zoom).toBe(2)
    const back = worldToScreen(c2, world)
    expect(back.x).toBeCloseTo(200)
    expect(back.y).toBeCloseTo(100)
  })

  it('le zoom est borné à 2 % et 25 600 %', () => {
    const c = { x: 0, y: 0, zoom: 1 }
    expect(zoomAt(c, 1e6, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(c, 1e-6, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM)
    expect(clampZoom(0.001)).toBe(0.02)
    expect(clampZoom(1000)).toBe(256)
  })

  it('un cran de molette zoome d’au plus 36 %', () => {
    expect(wheelZoomFactor(0)).toBe(1)
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(-100)).toBeLessThanOrEqual(1.36)
    expect(wheelZoomFactor(-10000)).toBe(1.36)
    expect(wheelZoomFactor(10000)).toBeCloseTo(1 / 1.36)
  })

  it('la molette déplace de 1,5 × le delta, borné à 120 px', () => {
    expect(wheelPan(10, 1000)).toEqual({ dx: -15, dy: -120 })
    expect(wheelPan(-200, 0)).toEqual({ dx: 120, dy: -0 })
  })

  it('Ctrl+/Ctrl- passent d’une puissance de 2 à la suivante', () => {
    expect(stepZoom(1, 1)).toBe(2)
    expect(stepZoom(1, -1)).toBe(0.5)
    expect(stepZoom(0.7, 1)).toBe(1)
    expect(stepZoom(0.7, -1)).toBe(0.5)
    expect(stepZoom(256, 1)).toBe(256)
    expect(stepZoom(0.03, -1)).toBe(0.02)
  })

  it('tout voir : cadre avec une marge de 40 px, sans dépasser 100 %', () => {
    expect(fitRect({ x: 0, y: 0, width: 1000, height: 500 }, { width: 1080, height: 580 })).toEqual({ x: 40, y: 40, zoom: 1 })
    expect(fitRect({ x: 0, y: 0, width: 2000, height: 1000 }, { width: 1080, height: 580 })).toEqual({ x: 40, y: 40, zoom: 0.5 })
    expect(fitRect({ x: 100, y: -50, width: 2000, height: 1000 }, { width: 1080, height: 580 })).toEqual({ x: -10, y: 65, zoom: 0.5 })
    expect(fitRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 1080, height: 580 }).zoom).toBe(1)
  })
})
