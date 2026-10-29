import { isInstanceRoot, isMain } from '../../core/components'
import { INSTANCE_LOCKED, type ApplyResult, type Op } from '../../core/ops'
import { findNode, walk } from '../../core/tree'
import type { FrameNode, MaquetteDocument, Node } from '../../core/types'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'
import { fitTo } from './camera-actions'
import { wrapInFrameOps } from './canvasOps'
import { domMeasure } from './measure'
import { worldRectOf } from './rects'

/**
 * Actions des composants côté interface : créer un composant, poser une instance, aller au principal,
 * rétablir, détacher. Les messages affichés à l'utilisateur sont en anglais (ceux du noyau, en français,
 * sont destinés à Claude).
 */

/** Message lisible d'un lot refusé pour une raison de composant, ou null. */
export function componentRefusal(result: ApplyResult): string | null {
  if (result.ok) return null
  const messages = result.errors.map((e) => e.message)
  if (messages.some((m) => m.includes(INSTANCE_LOCKED))) {
    return 'Layers inside an instance can’t be added, deleted or moved. Edit the main component, or detach the instance.'
  }
  if (messages.some((m) => m.includes('boucle'))) return 'A component can’t contain an instance of itself.'
  if (messages.some((m) => m.includes('mise en page (auto ou libre)'))) {
    return 'Auto layout of an instance is set in its main component.'
  }
  return null
}

/** Applique un lot ; refusé pour une raison de composant, le dit à l'utilisateur. */
function dispatch(ops: Op[], label: string): ApplyResult {
  const result = docStore.getState().dispatch(ops, label)
  const message = componentRefusal(result)
  if (message) docStore.getState().showError(message)
  else if (!result.ok) console.error(`« ${label} » refusé`, result.errors)
  return result
}

/** Principal d'un calque : lui-même s'il est principal, sinon celui de son instance. */
export function mainOf(doc: MaquetteDocument, node: Node): FrameNode | null {
  const id = node.type !== 'frame' ? undefined : node.component ? node.id : node.instanceOf
  const main = id ? findNode(doc, id)?.node : undefined
  return isMain(main) ? main : null
}

/** Instance (racine) qui contient le calque, lui compris. */
export function instanceRootOf(doc: MaquetteDocument, id: string): FrameNode | null {
  for (let loc = findNode(doc, id); loc; loc = loc.parent ? findNode(doc, loc.parent.id) : null) {
    if (isInstanceRoot(loc.node)) return loc.node
  }
  return null
}

/**
 * Conteneur où l'on peut ajouter des calques : `parent`, ou s'il est dans une instance, le parent de
 * l'instance la plus haute (une instance n'accepte pas de nouveaux calques).
 */
export function editableParent(doc: MaquetteDocument, parent: string): string {
  let target = parent
  for (let loc = findNode(doc, parent); loc; loc = loc.parent ? findNode(doc, loc.parent.id) : null) {
    if (loc.node.type === 'frame' && loc.node.instanceOf !== undefined) target = loc.parent?.id ?? loc.page.id
  }
  return target
}

/** Principaux du document, page par page, dans l'ordre. */
export function mainComponents(doc: MaquetteDocument): { node: FrameNode; page: string }[] {
  const out: { node: FrameNode; page: string }[] = []
  walk(doc, ({ node, page }) => {
    if (isMain(node)) out.push({ node, page: page.name })
  })
  return out
}

/** Nombre d'instances (racines) d'un principal. */
export function instanceCount(doc: MaquetteDocument, mainId: string): number {
  let count = 0
  walk(doc, ({ node }) => {
    if (isInstanceRoot(node) && node.instanceOf === mainId) count++
  })
  return count
}

/**
 * Créer un composant (Ctrl+Alt+K) : un cadre sélectionné devient principal ; plusieurs éléments, ou
 * un élément qui n'est pas un cadre, sont d'abord encadrés.
 */
export function createComponent(): void {
  const doc = docStore.getState().doc
  const ids = uiStore.getState().selection
  if (ids.length === 0) return
  const single = ids.length === 1 ? findNode(doc, ids[0]!)?.node : undefined
  if (single?.type === 'frame' && !single.component && single.source === undefined) {
    dispatch([{ op: 'update', id: single.id, set: { component: true } }], 'Créer un composant')
    return
  }
  if (single && isMain(single)) return
  const wrap = wrapInFrameOps(doc, ids, domMeasure)
  const frame = wrap.select[0]
  if (!frame) return
  const result = dispatch([...wrap.ops, { op: 'update', id: frame, set: { component: true, name: 'Component' } }], 'Créer un composant')
  if (result.ok) uiStore.getState().select([result.ids[frame] ?? frame])
}

/**
 * Pose une instance du principal : dans le cadre sélectionné (au centre s'il est libre, à la suite
 * s'il est automatique), sinon sur la page au centre de la vue. L'instance est sélectionnée.
 */
export function insertInstance(mainId: string): void {
  const doc = docStore.getState().doc
  const ui = uiStore.getState()
  const main = findNode(doc, mainId)?.node
  if (!isMain(main)) return
  const measured = worldRectOf(mainId)
  const width = typeof main.width === 'number' ? main.width : (measured?.width ?? 100)
  const height = typeof main.height === 'number' ? main.height : (measured?.height ?? 100)
  const selected = ui.selection.length === 1 ? findNode(doc, ui.selection[0]!) : null
  const node: { id: string; type: 'frame'; instanceOf: string; x?: number; y?: number } = { id: '$instance', type: 'frame', instanceOf: mainId }
  let parent = docStore.getState().pageId
  const target = selected?.node.type === 'frame' ? findNode(doc, editableParent(doc, selected.node.id))?.node : undefined
  if (target?.type === 'frame' && target.id !== mainId) {
    parent = target.id
    if (target.layout.mode !== 'auto') {
      const r = worldRectOf(parent)
      node.x = Math.round((r?.width ?? width) / 2 - width / 2)
      node.y = Math.round((r?.height ?? height) / 2 - height / 2)
    }
  } else {
    const { camera, viewport } = ui
    node.x = Math.round((viewport.width / 2 - camera.x) / camera.zoom - width / 2)
    node.y = Math.round((viewport.height / 2 - camera.y) / camera.zoom - height / 2)
  }
  const result = dispatch([{ op: 'create', parent, node }], 'Insérer une instance')
  const id = result.ok ? result.ids.$instance : undefined
  if (id) ui.select([id])
}

/** Sélectionne le principal (sur sa page) et le cadre dans la vue. */
export function goToMain(id: string): void {
  const doc = docStore.getState().doc
  const node = findNode(doc, id)?.node
  const main = node ? mainOf(doc, node) : null
  if (!main) return
  const page = findNode(doc, main.id)!.page
  docStore.getState().setPage(page.id)
  uiStore.getState().select([main.id])
  requestAnimationFrame(() => fitTo([main.id], 200))
}

/** Rétablit le principal sur l'élément (racine : toute l'instance ; calque : lui et ses enfants). */
export function resetInstance(id: string): void {
  dispatch([{ op: 'update', id, set: { overrides: null } }], 'Rétablir le composant')
}

/** Détache l'instance : ses calques deviennent ordinaires. */
export function detachInstance(id: string): void {
  dispatch([{ op: 'update', id, set: { instanceOf: null } }], 'Détacher l’instance')
}

/** Vrai si l'élément ou un de ses calques a des surcharges. */
export function hasOverrides(node: Node): boolean {
  if (node.overrides?.length) return true
  return node.type === 'frame' && node.children.some((c) => c.source !== undefined && hasOverrides(c))
}
