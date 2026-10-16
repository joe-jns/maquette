import type { Rect } from '../../core/types'

type Point = { x: number; y: number }
type Direction = 'row' | 'column'

interface Axes { main: 'x' | 'y'; size: 'width' | 'height'; cross: 'x' | 'y'; crossSize: 'width' | 'height' }

function axes(direction: Direction): Axes {
  return direction === 'row'
    ? { main: 'x', size: 'width', cross: 'y', crossSize: 'height' }
    : { main: 'y', size: 'height', cross: 'x', crossSize: 'width' }
}

/**
 * Regroupe les enfants (dans l'ordre) en lignes de retour à la ligne : un enfant ouvre une nouvelle ligne
 * dès qu'il ne recouvre plus, sur l'axe secondaire, la ligne en cours. Renvoie, pour chaque enfant, l'étendue
 * secondaire de sa ligne.
 */
function lineSpans(rects: Rect[], a: Axes): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = []
  let line: { start: number; end: number } | null = null
  for (const r of rects) {
    const start = r[a.cross]
    const end = start + r[a.crossSize]
    if (line !== null && start < line.end && end > line.start) {
      line.start = Math.min(line.start, start)
      line.end = Math.max(line.end, end)
    } else {
      line = { start, end }
    }
    result.push(line)
  }
  return result
}

/**
 * Indice d'insertion dans un cadre automatique. `rects` = enfants SANS l'élément tiré, dans l'ordre.
 * Renvoie l'indice du premier enfant « au-delà » du pointeur, sinon `rects.length`.
 */
export function insertionIndex(rects: Rect[], direction: Direction, pointer: Point, wrap = false): number {
  const a = axes(direction)
  const p = pointer[a.main]
  const pc = pointer[a.cross]
  const lines = wrap ? lineSpans(rects, a) : null
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    if (lines !== null) {
      const line = lines[i]
      if (line.start > pc) return i // ligne suivante (le pointeur est au-dessus / avant elle)
      if (line.end < pc) continue // ligne précédente
    }
    if (r[a.main] + r[a.size] / 2 > p) return i
  }
  return rects.length
}

/**
 * Trait d'insertion, perpendiculaire à l'axe principal, à mi-chemin entre l'enfant `index - 1` et l'enfant
 * `index` ; aux extrémités, au bord intérieur du conteneur.
 */
export function insertionMarker(
  rects: Rect[],
  direction: Direction,
  index: number,
  container: Rect,
): { x1: number; y1: number; x2: number; y2: number } {
  const a = axes(direction)
  const before = index > 0 ? rects[index - 1] : undefined
  const after = index < rects.length ? rects[index] : undefined
  const containerStart = container[a.main]
  const containerEnd = containerStart + container[a.size]

  let at: number
  if (before && after) at = (before[a.main] + before[a.size] + after[a.main]) / 2
  else if (after) at = containerStart
  else if (before) at = containerEnd
  else at = containerStart

  const c1 = container[a.cross]
  const c2 = c1 + container[a.crossSize]
  return direction === 'row'
    ? { x1: at, y1: c1, x2: at, y2: c2 }
    : { x1: c1, y1: at, x2: c2, y2: at }
}
