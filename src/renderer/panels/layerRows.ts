import { containsId } from '../../core/tree'
import type { FrameNode, Node, NodeType, Page } from '../../core/types'
import type { IconName } from '../ui/icons'

/** Une ligne du panneau des calques. */
export interface LayerRow {
  id: string
  name: string
  type: NodeType
  depth: number
  parentId: string | null
  hasChildren: boolean
  expanded: boolean
  visible: boolean
  locked: boolean
  /** Le parent est en mise en page automatique. */
  auto: boolean
  /** Icône du type (un cadre automatique montre sa direction) : calculée ici, pas de recherche par ligne. */
  icon: IconName
  /** Ids des ancêtres, du parent à la racine (teinte des enfants de la sélection). */
  ancestors: string[]
}

function iconOf(node: Node): IconName {
  switch (node.type) {
    case 'frame':
      return node.layout.mode === 'auto' ? (node.layout.direction === 'row' ? 'autoRow' : 'autoCol') : 'frame'
    case 'text':
      return 'text'
    case 'image':
      return 'image'
    case 'shape':
      return node.shape === 'ellipse' ? 'ellipse' : 'rect'
    default:
      return 'rect'
  }
}

const isAuto = (parent: FrameNode | null): boolean => parent !== null && parent.layout.mode === 'auto'

/** Ordre d'affichage : premier enfant en premier dans un cadre automatique, sinon l'élément du dessus d'abord. */
const displayOrder = (parent: FrameNode | null, children: Node[]): Node[] =>
  isAuto(parent) ? children : [...children].reverse()

/** Lignes du panneau des calques, dans l'ordre de Figma. Les enfants d'un cadre replié ne sont pas listés. */
export function layerRows(page: Page, expanded: ReadonlySet<string>): LayerRow[] {
  const rows: LayerRow[] = []
  const visit = (parent: FrameNode | null, children: Node[], depth: number, ancestors: string[]) => {
    for (const node of displayOrder(parent, children)) {
      const isFrame = node.type === 'frame'
      const open = isFrame && expanded.has(node.id)
      rows.push({
        id: node.id,
        name: node.name,
        type: node.type,
        depth,
        parentId: parent ? parent.id : null,
        hasChildren: isFrame && node.children.length > 0,
        expanded: open,
        visible: node.visible,
        locked: node.locked,
        auto: isAuto(parent),
        icon: iconOf(node),
        ancestors,
      })
      if (open) visit(node, node.children, depth + 1, [node.id, ...ancestors])
    }
  }
  visit(null, page.children, 0, [])
  return rows
}

function findInPage(page: Page, id: string): { node: Node; parent: FrameNode | null } | null {
  const search = (parent: FrameNode | null, list: Node[]): { node: Node; parent: FrameNode | null } | null => {
    for (const node of list) {
      if (node.id === id) return { node, parent }
      if (node.type === 'frame') {
        const found = search(node, node.children)
        if (found) return found
      }
    }
    return null
  }
  return search(null, page.children)
}

/**
 * Où déposer les éléments tirés sur la ligne `overIndex` (`ratio` : 0 en haut de la ligne, 1 en bas).
 * Quart haut → avant la ligne, quart bas → après, milieu d'un cadre → dedans (en dernier visuellement),
 * milieu d'un autre élément → avant.
 *
 * L'indice renvoyé est l'indice FINAL dans le tableau `children` du parent, après retrait des éléments
 * tirés (sémantique de l'opération `move`) : on retranche les éléments tirés déjà placés dans ce parent
 * avant l'indice visé. Avec plusieurs éléments tirés, c'est l'indice où commence le bloc déposé.
 * Déposer dans un élément tiré ou un de ses descendants → `null`.
 */
export function layerDrop(
  page: Page,
  rows: LayerRow[],
  overIndex: number,
  ratio: number,
  dragged: string[],
): { parent: string; index: number } | null {
  const row = rows[overIndex]
  if (!row || dragged.length === 0) return null
  const over = findInPage(page, row.id)
  if (!over) return null

  let parent: FrameNode | null
  let raw: number
  const zone = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'middle'
  if (zone === 'middle' && over.node.type === 'frame') {
    // Dedans, en dernier visuellement : au-dessus (fin du tableau) dans un cadre libre, à la fin dans un cadre automatique.
    parent = over.node
    raw = over.node.children.length
  } else {
    parent = over.parent
    const list = parent ? parent.children : page.children
    const i = list.findIndex((n) => n.id === row.id)
    // Avant visuellement = au-dessus dans un conteneur inversé (indice + 1), juste avant dans un cadre automatique.
    const before = zone !== 'after'
    raw = isAuto(parent) === before ? i : i + 1
  }

  const target = parent
  if (target && dragged.some((id) => {
    const d = findInPage(page, id)
    return d !== null && containsId(d.node, target.id)
  })) return null

  const list = parent ? parent.children : page.children
  const shift = list.slice(0, raw).filter((n) => dragged.includes(n.id)).length
  return { parent: parent ? parent.id : page.id, index: raw - shift }
}
