import type { Rect } from '../../core/types'

/** Point en coordonnées (écran ou monde selon le contexte). */
export interface Point { x: number; y: number }

/** Plus petit rectangle qui englobe tous les rectangles ; `null` si la liste est vide. */
export function union(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    left = Math.min(left, r.x)
    top = Math.min(top, r.y)
    right = Math.max(right, r.x + r.width)
    bottom = Math.max(bottom, r.y + r.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Vrai si les deux rectangles se recouvrent (des bords qui se touchent ne comptent pas). */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Vrai si `inner` tient entièrement dans `outer`, à `tolerance` près. */
export function contains(outer: Rect, inner: Rect, tolerance = 0): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  )
}

/** Rectangle défini par deux coins quelconques. */
export function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

export function center(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/** Trait de mesure entre deux points, avec sa longueur. */
export interface DistanceLine { x1: number; y1: number; x2: number; y2: number; length: number }

/**
 * Lignes de distance entre `a` et `b`.
 * Si `b` contient `a` : les 4 distances aux bords de `b` (gauche, droite, haut, bas).
 * Sinon : l'écart horizontal et/ou vertical entre les deux, tracé au milieu de leur
 * recouvrement sur l'autre axe, ou au centre de `a` s'ils ne se recouvrent pas.
 */
export function distanceLines(a: Rect, b: Rect): DistanceLine[] {
  const c = center(a)
  const aRight = a.x + a.width
  const aBottom = a.y + a.height
  const bRight = b.x + b.width
  const bBottom = b.y + b.height

  if (contains(b, a)) {
    return [
      { x1: b.x, y1: c.y, x2: a.x, y2: c.y, length: a.x - b.x },
      { x1: aRight, y1: c.y, x2: bRight, y2: c.y, length: bRight - aRight },
      { x1: c.x, y1: b.y, x2: c.x, y2: a.y, length: a.y - b.y },
      { x1: c.x, y1: aBottom, x2: c.x, y2: bBottom, length: bBottom - aBottom },
    ]
  }

  const lines: DistanceLine[] = []

  const overlapTop = Math.max(a.y, b.y)
  const overlapBottom = Math.min(aBottom, bBottom)
  const y = overlapTop < overlapBottom ? (overlapTop + overlapBottom) / 2 : c.y
  if (b.x >= aRight) lines.push({ x1: aRight, y1: y, x2: b.x, y2: y, length: b.x - aRight })
  else if (a.x >= bRight) lines.push({ x1: bRight, y1: y, x2: a.x, y2: y, length: a.x - bRight })

  const overlapLeft = Math.max(a.x, b.x)
  const overlapRight = Math.min(aRight, bRight)
  const x = overlapLeft < overlapRight ? (overlapLeft + overlapRight) / 2 : c.x
  if (b.y >= aBottom) lines.push({ x1: x, y1: aBottom, x2: x, y2: b.y, length: b.y - aBottom })
  else if (a.y >= bBottom) lines.push({ x1: x, y1: bBottom, x2: x, y2: a.y, length: a.y - bBottom })

  return lines
}
