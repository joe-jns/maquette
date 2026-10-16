import type { Rect } from '../../core/types'
import { uiStore } from '../state/ui'

/** Lecture des positions réellement affichées : la mise en page vient du navigateur, on la mesure. */

const nodeEl = (id: string) => document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)
const worldEl = () => document.querySelector<HTMLElement>('[data-testid="world"]')

/** Rectangle d'un élément en coordonnées du monde (indépendant du zoom et du déplacement de la vue). */
export function worldRectOf(id: string): Rect | undefined {
  const el = nodeEl(id)
  const world = worldEl()
  if (!el || !world) return undefined
  const { zoom } = uiStore.getState().camera
  const r = el.getBoundingClientRect()
  const w = world.getBoundingClientRect()
  return { x: (r.left - w.left) / zoom, y: (r.top - w.top) / zoom, width: r.width / zoom, height: r.height / zoom }
}

/** Rectangle d'un élément relatif à son parent (ou au monde pour un élément posé sur la page). */
export function parentRectOf(id: string): Rect | undefined {
  const el = nodeEl(id)
  if (!el) return undefined
  const origin = el.parentElement?.closest<HTMLElement>('[data-node-id]') ?? worldEl()
  if (!origin) return undefined
  const { zoom } = uiStore.getState().camera
  const r = el.getBoundingClientRect()
  const o = origin.getBoundingClientRect()
  return { x: (r.left - o.left) / zoom, y: (r.top - o.top) / zoom, width: r.width / zoom, height: r.height / zoom }
}

/** Élément le plus profond sous un point de l'écran (la surcouche ne capte pas la souris). */
export function deepestHitAt(clientX: number, clientY: number): string | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const id = (el as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId
    if (id) return id
  }
  return null
}
