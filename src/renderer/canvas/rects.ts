import type { Rect } from '../../core/types'
import { uiStore } from '../state/ui'

/** Lecture des positions réellement affichées : la mise en page vient du navigateur, on la mesure. */

/**
 * Registre identifiant → balise du canevas, rempli par les composants au montage (ref) : une lecture
 * de Map au lieu d'un `querySelector` qui parcourt tout le DOM à chaque mesure.
 */
const nodeEls = new Map<string, HTMLElement>()
let world: HTMLElement | null = null

/** Ref d'une balise d'élément du canevas : l'inscrit au montage, la retire au démontage. */
export function registerNode(id: string, el: HTMLElement): () => void {
  nodeEls.set(id, el)
  return () => {
    if (nodeEls.get(id) === el) nodeEls.delete(id)
  }
}

/** Ref du monde (la couche que la caméra déplace). */
export function registerWorld(el: HTMLElement | null): void {
  world = el
}

/** Balise affichée d'un élément du canevas (repli sur une recherche si elle n'est pas inscrite). */
export function nodeElement(id: string): HTMLElement | null {
  const el = nodeEls.get(id)
  if (el?.isConnected) return el
  return document.querySelector<HTMLElement>(`.canvas [data-node-id="${CSS.escape(id)}"]`)
}

const nodeEl = nodeElement
const worldEl = () => (world?.isConnected ? world : document.querySelector<HTMLElement>('[data-testid="world"]'))

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
