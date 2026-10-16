import type { Rect } from '../../core/types'
import type { Point } from './geometry'

/** Caméra du canevas : point écran = point monde × zoom + (x, y). */
export interface Camera { x: number; y: number; zoom: number }

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 256

/** Facteur de zoom maximal pour un seul événement de molette (±36 %). */
const MAX_WHEEL_FACTOR = 1.36
/** Déplacement maximal (px écran) pour un seul événement de molette. */
const MAX_WHEEL_PAN = 120

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

export function screenToWorld(c: Camera, p: Point): Point {
  return { x: (p.x - c.x) / c.zoom, y: (p.y - c.y) / c.zoom }
}

export function worldToScreen(c: Camera, p: Point): Point {
  return { x: p.x * c.zoom + c.x, y: p.y * c.zoom + c.y }
}

/** Multiplie le zoom par `factor` (borné) en gardant immobile le point du monde sous `screen`. */
export function zoomAt(c: Camera, factor: number, screen: Point): Camera {
  const zoom = clampZoom(c.zoom * factor)
  const world = screenToWorld(c, screen)
  return { x: screen.x - world.x * zoom, y: screen.y - world.y * zoom, zoom }
}

/** Facteur de zoom d'un événement de molette (Ctrl+molette ou pincement). */
export function wheelZoomFactor(deltaY: number): number {
  const f = Math.exp(-deltaY * 0.0025)
  return Math.min(MAX_WHEEL_FACTOR, Math.max(1 / MAX_WHEEL_FACTOR, f))
}

const clampPan = (v: number): number => Math.min(MAX_WHEEL_PAN, Math.max(-MAX_WHEEL_PAN, v))

/** Déplacement de caméra d'un événement de molette : −delta × 1,5, chaque composante bornée à ±120 px. */
export function wheelPan(deltaX: number, deltaY: number): { dx: number; dy: number } {
  return { dx: clampPan(-(deltaX * 1.5)), dy: clampPan(-(deltaY * 1.5)) }
}

/** Puissance de 2 strictement suivante (1) ou précédente (−1), bornée. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const exp = Math.log2(zoom)
  const next = direction === 1 ? Math.pow(2, Math.floor(exp) + 1) : Math.pow(2, Math.ceil(exp) - 1)
  return clampZoom(next)
}

/** Caméra qui cadre `bounds` au centre du viewport, avec une marge, sans dépasser `maxZoom`. */
export function fitRect(
  bounds: Rect,
  viewport: { width: number; height: number },
  margin = 40,
  maxZoom = 1,
): Camera {
  const availW = Math.max(1, viewport.width - 2 * margin)
  const availH = Math.max(1, viewport.height - 2 * margin)
  const zx = bounds.width > 0 ? availW / bounds.width : Infinity
  const zy = bounds.height > 0 ? availH / bounds.height : Infinity
  const zoom = clampZoom(Math.min(maxZoom, zx, zy))
  return {
    x: (viewport.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (viewport.height - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  }
}
