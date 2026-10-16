import { findNode } from '../../core/tree'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'
import { fitRect, stepZoom, type Camera } from './camera'
import { union } from './geometry'
import { worldRectOf } from './rects'

/** Actions de caméra partagées par le canevas, le clavier et le chargement d'un document. */

let animation = 0

/** Déplace la caméra, en douceur sur `durationMs` (zoom interpolé en échelle logarithmique). */
export function moveCamera(target: Camera, durationMs = 0): void {
  cancelAnimationFrame(animation)
  const from = uiStore.getState().camera
  if (durationMs <= 0) {
    uiStore.getState().setCamera(target)
    return
  }
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs)
    const e = 1 - (1 - t) ** 3
    const zoom = Math.exp(Math.log(from.zoom) + (Math.log(target.zoom) - Math.log(from.zoom)) * e)
    uiStore.getState().setCamera({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, zoom })
    if (t < 1) animation = requestAnimationFrame(step)
  }
  animation = requestAnimationFrame(step)
}

function currentPage() {
  const { doc, pageId } = docStore.getState()
  return doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!
}

/** Cadre l'ensemble des éléments de la page (Maj+1), ou les ids donnés (Maj+2). */
export function fitTo(ids: string[] | 'all', durationMs = 0): void {
  const list = ids === 'all' ? currentPage().children.map((n) => n.id) : ids
  const bounds = union(list.map(worldRectOf).filter((r) => r !== undefined))
  if (!bounds) return
  const { viewport } = uiStore.getState()
  moveCamera(fitRect(bounds, viewport, 40, ids === 'all' ? 1 : 8), durationMs)
}

/** Ctrl+0, Ctrl+=, Ctrl+- : zoom autour du centre de la vue. */
export function zoomAroundCenter(zoom: number): void {
  const { camera, viewport } = uiStore.getState()
  const cx = viewport.width / 2
  const cy = viewport.height / 2
  const k = zoom / camera.zoom
  moveCamera({ x: cx - (cx - camera.x) * k, y: cy - (cy - camera.y) * k, zoom })
}

export const zoomStep = (direction: 1 | -1) => zoomAroundCenter(stepZoom(uiStore.getState().camera.zoom, direction))

export function selectionExists(): boolean {
  const { selection } = uiStore.getState()
  const { doc } = docStore.getState()
  return selection.some((id) => findNode(doc, id) !== null)
}
