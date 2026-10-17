import type { Op } from '../../core/ops'
import { findNode } from '../../core/tree'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'
import { worldRectOf } from './rects'

const SIZE = 24

/**
 * Insère une icône choisie à la main : dans le cadre sélectionné (au centre s'il est libre, à la
 * suite s'il est automatique), sinon sur la page au centre de la vue. L'icône est sélectionnée.
 */
export function insertIcon(icon: string): void {
  const doc = docStore.getState().doc
  const ui = uiStore.getState()
  const selected = ui.selection.length === 1 ? findNode(doc, ui.selection[0]!) : null
  const node: { id: string; type: 'icon'; icon: string; x?: number; y?: number } = { id: '$icon', type: 'icon', icon }
  let parent = docStore.getState().pageId
  if (selected?.node.type === 'frame') {
    parent = selected.node.id
    if (selected.node.layout.mode !== 'auto') {
      const r = worldRectOf(parent)
      node.x = Math.round((r?.width ?? SIZE) / 2 - SIZE / 2)
      node.y = Math.round((r?.height ?? SIZE) / 2 - SIZE / 2)
    }
  } else {
    const { camera, viewport } = ui
    node.x = Math.round((viewport.width / 2 - camera.x) / camera.zoom - SIZE / 2)
    node.y = Math.round((viewport.height / 2 - camera.y) / camera.zoom - SIZE / 2)
  }
  const ops: Op[] = [{ op: 'create', parent, node }]
  const result = docStore.getState().dispatch(ops, 'Insérer une icône')
  const id = result.ok ? result.ids.$icon : undefined
  if (id) ui.select([id])
}
