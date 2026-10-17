import type { Op } from '../../core/ops'
import type { NodeLocation } from '../../core/tree'
import type { MaquetteDocument, Rect } from '../../core/types'
import { inFlow, topLevel } from './canvasOps'

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'
/** Rectangle affiché d'un élément en coordonnées du monde (mesuré dans le rendu). */
export type WorldRect = (id: string) => Rect | undefined

const round = (v: number) => Math.round(v * 100) / 100

/** Éléments que l'alignement peut déplacer : ceux qui ont un x/y (pas placés par une mise en page automatique). */
function movable(doc: MaquetteDocument, ids: readonly string[]): NodeLocation[] {
  return topLevel(doc, ids).filter((l) => !inFlow(l))
}

/**
 * Ce sur quoi on aligne : un seul élément s'aligne sur son cadre parent (rien s'il est posé
 * directement sur la page) ; plusieurs s'alignent sur leur boîte commune.
 */
function reference(locs: NodeLocation[], rect: WorldRect): Rect | null {
  if (locs.length === 1) return locs[0]!.parent ? (rect(locs[0]!.parent.id) ?? null) : null
  const rects = locs.map((l) => rect(l.node.id)).filter((r): r is Rect => !!r)
  if (rects.length < 2) return null
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return {
    x, y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  }
}

export const canAlign = (doc: MaquetteDocument, ids: readonly string[]): boolean => {
  const locs = movable(doc, ids)
  return locs.length > 1 || (locs.length === 1 && locs[0]!.parent !== null)
}

export const canDistribute = (doc: MaquetteDocument, ids: readonly string[]): boolean => movable(doc, ids).length >= 3

/** Déplacement d'un élément, en un `update` de x/y (un décalage dans le monde = le même dans son parent). */
function moveOp(loc: NodeLocation, dx: number, dy: number): Op | null {
  if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) return null
  const set: Record<string, number> = {}
  if (dx) set.x = round((loc.node.x ?? 0) + dx)
  if (dy) set.y = round((loc.node.y ?? 0) + dy)
  return { op: 'update', id: loc.node.id, set }
}

/** Aligner la sélection (bords ou centres), en un seul lot donc une seule annulation. */
export function alignOps(doc: MaquetteDocument, ids: readonly string[], edge: AlignEdge, rect: WorldRect): Op[] {
  const locs = movable(doc, ids)
  const ref = reference(locs, rect)
  if (!ref) return []
  const ops: Op[] = []
  for (const loc of locs) {
    const r = rect(loc.node.id)
    if (!r) continue
    let dx = 0
    let dy = 0
    if (edge === 'left') dx = ref.x - r.x
    else if (edge === 'hcenter') dx = ref.x + (ref.width - r.width) / 2 - r.x
    else if (edge === 'right') dx = ref.x + ref.width - r.width - r.x
    else if (edge === 'top') dy = ref.y - r.y
    else if (edge === 'vcenter') dy = ref.y + (ref.height - r.height) / 2 - r.y
    else dy = ref.y + ref.height - r.height - r.y
    const op = moveOp(loc, dx, dy)
    if (op) ops.push(op)
  }
  return ops
}

/** Répartir 3 éléments ou plus : le premier et le dernier restent, les écarts deviennent égaux. */
export function distributeOps(doc: MaquetteDocument, ids: readonly string[], axis: DistributeAxis, rect: WorldRect): Op[] {
  const h = axis === 'horizontal'
  const items = movable(doc, ids)
    .map((loc) => ({ loc, r: rect(loc.node.id) }))
    .filter((it): it is { loc: NodeLocation; r: Rect } => !!it.r)
    .map(({ loc, r }) => ({ loc, start: h ? r.x : r.y, size: h ? r.width : r.height }))
    .sort((a, b) => a.start + a.size / 2 - (b.start + b.size / 2))
  if (items.length < 3) return []
  const first = items[0]!
  const end = Math.max(...items.map((it) => it.start + it.size))
  const gap = (end - first.start - items.reduce((sum, it) => sum + it.size, 0)) / (items.length - 1)
  const ops: Op[] = []
  let at = first.start
  for (const it of items) {
    const d = at - it.start
    const op = moveOp(it.loc, h ? d : 0, h ? 0 : d)
    if (op) ops.push(op)
    at += it.size + gap
  }
  return ops
}
