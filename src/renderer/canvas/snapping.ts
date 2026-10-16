import type { Rect } from '../../core/types'

/** Ligne d'alignement : verticale `x = at` de `y = from` à `to` (axe 'x'), ou horizontale `y = at` (axe 'y'). */
export interface Guide { axis: 'x' | 'y'; at: number; from: number; to: number }
/** Écart égal mis en évidence : de `from` à `to` sur l'axe, dessiné à la position `at` de l'autre axe. */
export interface Gap { axis: 'x' | 'y'; from: number; to: number; at: number }
export interface SnapResult { dx: number; dy: number; guides: Guide[]; gaps: Gap[] }

type Axis = 'x' | 'y'

const EPS = 1e-6

/** Intervalle d'un rectangle sur un axe. */
interface Span { start: number; end: number }

function span(rect: Rect, axis: Axis): Span {
  return axis === 'x'
    ? { start: rect.x, end: rect.x + rect.width }
    : { start: rect.y, end: rect.y + rect.height }
}

function other(axis: Axis): Axis {
  return axis === 'x' ? 'y' : 'x'
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end
}

/** Une correspondance « bord » : un repère de l'élément (début, centre, fin) tombe sur un repère d'une cible. */
interface EdgeMatch { kind: 'edge'; offset: number; at: number; target: Rect }
/** Une correspondance « espacement » : les écarts à mettre en évidence, en coordonnées de l'axe (avant décalage de l'élément, qui est noté null). */
interface SpacingMatch { kind: 'spacing'; offset: number; gaps: Array<{ from: Rect | null; to: Rect | null; gapFrom: number; gapTo: number }> }
type Match = EdgeMatch | SpacingMatch

/** Toutes les correspondances possibles sur un axe, sans filtre de seuil. */
function matchesOnAxis(moving: Rect, targets: Rect[], axis: Axis): Match[] {
  const m = span(moving, axis)
  const size = m.end - m.start
  const anchors = [m.start, (m.start + m.end) / 2, m.end]
  const out: Match[] = []

  for (const target of targets) {
    const t = span(target, axis)
    const points = [t.start, (t.start + t.end) / 2, t.end]
    for (const p of points) {
      for (const a of anchors) out.push({ kind: 'edge', offset: p - a, at: p, target })
    }
  }

  // Espacements égaux : seulement entre cibles qui recouvrent l'élément sur l'autre axe.
  const cross = other(axis)
  const mc = span(moving, cross)
  const row = targets
    .filter((t) => overlaps(span(t, cross), mc))
    .sort((a, b) => span(a, axis).start - span(b, axis).start)

  for (const a of row) {
    const sa = span(a, axis)
    // Voisine directe : la cible qui commence le plus tôt après la fin de `a`.
    let b: Rect | null = null
    for (const c of row) {
      const sc = span(c, axis)
      if (sc.start >= sa.end - EPS && c !== a && (b === null || sc.start < span(b, axis).start)) b = c
    }
    if (b === null) continue
    const sb = span(b, axis)
    // Rien ne doit déborder dans l'écart entre les deux.
    const blocked = row.some((c) => {
      if (c === a || c === b) return false
      const sc = span(c, axis)
      return sc.start < sb.start - EPS && sc.end > sa.end + EPS
    })
    if (blocked) continue
    const gap = sb.start - sa.end

    // À la suite de la paire.
    out.push({
      kind: 'spacing',
      offset: sb.end + gap - m.start,
      gaps: [
        { from: a, to: b, gapFrom: sa.end, gapTo: sb.start },
        { from: b, to: null, gapFrom: sb.end, gapTo: sb.end + gap },
      ],
    })
    // Avant la paire.
    out.push({
      kind: 'spacing',
      offset: sa.start - gap - m.end,
      gaps: [
        { from: null, to: a, gapFrom: sa.start - gap, gapTo: sa.start },
        { from: a, to: b, gapFrom: sa.end, gapTo: sb.start },
      ],
    })
    // Au milieu de la paire, si l'élément y tient.
    if (gap >= size) {
      const half = (gap - size) / 2
      out.push({
        kind: 'spacing',
        offset: sa.end + half - m.start,
        gaps: [
          { from: a, to: null, gapFrom: sa.end, gapTo: sa.end + half },
          { from: null, to: b, gapFrom: sb.start - half, gapTo: sb.start },
        ],
      })
    }
  }
  return out
}

/** Garde les correspondances du meilleur décalage (≤ seuil) ; à égalité de distance, un bord l'emporte sur un espacement. */
function bestOnAxis(matches: Match[], threshold: number): { offset: number; chosen: Match[] } {
  const within = matches.filter((m) => Math.abs(m.offset) <= threshold + EPS)
  if (within.length === 0) return { offset: 0, chosen: [] }
  let minAbs = Infinity
  for (const m of within) minAbs = Math.min(minAbs, Math.abs(m.offset))
  const closest = within.filter((m) => Math.abs(m.offset) <= minAbs + EPS)
  const offset = (closest.find((m) => m.kind === 'edge') ?? closest[0]).offset
  // Tout ce qui tombe sur ce même décalage est affiché (bords et espacements décrivent la même position).
  const chosen = within.filter((m) => Math.abs(m.offset - offset) <= EPS)
  return { offset, chosen }
}

/** Milieu du recouvrement de deux intervalles (ou milieu de l'espace entre eux s'ils ne se recouvrent pas). */
function middle(a: Span, b: Span): number {
  return (Math.max(a.start, b.start) + Math.min(a.end, b.end)) / 2
}

function shifted(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height }
}

/**
 * Magnétisme d'un déplacement : décalage `dx`/`dy` à appliquer à `moving` pour s'aligner sur `targets`
 * (bords, centres, espacements égaux), chaque axe indépendamment, à `threshold` près (même unité que les rectangles).
 */
export function snapMove(moving: Rect, targets: Rect[], threshold: number): SnapResult {
  if (targets.length === 0 || !(threshold >= 0)) return { dx: 0, dy: 0, guides: [], gaps: [] }

  const bx = bestOnAxis(matchesOnAxis(moving, targets, 'x'), threshold)
  const by = bestOnAxis(matchesOnAxis(moving, targets, 'y'), threshold)
  const dx = bx.offset
  const dy = by.offset
  const snapped = shifted(moving, dx, dy)

  const guides: Guide[] = []
  const gaps: Gap[] = []
  const guideSeen = new Map<string, Guide>()
  const gapSeen = new Set<string>()

  for (const [axis, best] of [['x', bx], ['y', by]] as const) {
    const cross = other(axis)
    const sm = span(snapped, cross)
    for (const m of best.chosen) {
      if (m.kind === 'edge') {
        const st = span(m.target, cross)
        const from = Math.min(sm.start, st.start)
        const to = Math.max(sm.end, st.end)
        const key = `${axis}:${m.at.toFixed(6)}`
        const prev = guideSeen.get(key)
        if (prev) {
          prev.from = Math.min(prev.from, from)
          prev.to = Math.max(prev.to, to)
        } else {
          const g: Guide = { axis, at: m.at, from, to }
          guideSeen.set(key, g)
          guides.push(g)
        }
      } else {
        for (const g of m.gaps) {
          const ra = span(g.from ?? snapped, cross)
          const rb = span(g.to ?? snapped, cross)
          const at = middle(ra, rb)
          const key = `${axis}:${g.gapFrom.toFixed(6)}:${g.gapTo.toFixed(6)}`
          if (gapSeen.has(key)) continue
          gapSeen.add(key)
          gaps.push({ axis, from: g.gapFrom, to: g.gapTo, at })
        }
      }
    }
  }

  return { dx, dy, guides, gaps }
}

/** Magnétisme d'une valeur isolée (bord redimensionné) : le candidat le plus proche à `threshold` près. */
export function snapValue(value: number, candidates: number[], threshold: number): { value: number; snapped: number | null } {
  let best: number | null = null
  for (const c of candidates) {
    const d = Math.abs(c - value)
    if (d > threshold + EPS) continue
    if (best === null || d < Math.abs(best - value) - EPS) best = c
  }
  return best === null ? { value, snapped: null } : { value: best, snapped: best }
}
