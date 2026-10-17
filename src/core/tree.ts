import type { FrameNode, MaquetteDocument, Node, Page, Size } from './types'

export interface NodeLocation {
  node: Node
  parent: FrameNode | null
  page: Page
  index: number
  path: string
}

export const isHug = (s: Size): boolean => typeof s === 'object' && s.mode === 'hug'
export const isFill = (s: Size): boolean => typeof s === 'object' && s.mode === 'fill'

export function walk(doc: MaquetteDocument, visit: (loc: NodeLocation) => void): void {
  const visitList = (list: Node[], parent: FrameNode | null, page: Page, basePath: string) => {
    list.forEach((node, index) => {
      const path = `${basePath}.children[${index}]`
      visit({ node, parent, page, index, path })
      if (node.type === 'frame') visitList(node.children, node, page, path)
    })
  }
  doc.pages.forEach((page, pi) => visitList(page.children, null, page, `pages[${pi}]`))
}

/**
 * Index identifiant → emplacement, construit une seule fois par version du document.
 *
 * Un document validé est gelé (Immer gèle tout ce qu'il produit, et `load` gèle le document ouvert) :
 * il ne change plus jamais, l'index reste donc juste tant que l'objet vit. Les documents non gelés
 * (brouillons Immer pendant `applyOps`, objets de test) passent par une recherche directe qui s'arrête
 * dès qu'elle trouve.
 */
interface Entry { node: Node; parent: FrameNode | null; page: Page; pageIndex: number; index: number }
interface DocIndex { nodes: Map<string, Entry>; ids: Set<string> }

const indexes = new WeakMap<MaquetteDocument, DocIndex>()

function buildIndex(doc: MaquetteDocument): DocIndex {
  const nodes = new Map<string, Entry>()
  const ids = new Set<string>()
  doc.pages.forEach((p) => ids.add(p.id))
  doc.styles.colors.forEach((s) => ids.add(s.id))
  doc.styles.text.forEach((s) => ids.add(s.id))
  const visitList = (list: Node[], parent: FrameNode | null, page: Page, pageIndex: number) => {
    for (let index = 0; index < list.length; index++) {
      const node = list[index]!
      // Premier trouvé gagne, comme l'ancien parcours (un doublon est refusé par la validation).
      if (!nodes.has(node.id)) nodes.set(node.id, { node, parent, page, pageIndex, index })
      ids.add(node.id)
      if (node.type === 'frame') visitList(node.children, node, page, pageIndex)
    }
  }
  doc.pages.forEach((page, pi) => visitList(page.children, null, page, pi))
  return { nodes, ids }
}

function indexOf(doc: MaquetteDocument): DocIndex | null {
  if (!Object.isFrozen(doc)) return null
  let index = indexes.get(doc)
  if (!index) {
    index = buildIndex(doc)
    indexes.set(doc, index)
  }
  return index
}

/** Chemin lisible (`pages[0].children[2]…`), calculé seulement quand on le lit. */
function locationOf(index: DocIndex, entry: Entry): NodeLocation {
  const { node, parent, page, index: i } = entry
  return {
    node,
    parent,
    page,
    index: i,
    get path() {
      const segments: string[] = []
      let cur: Entry | undefined = entry
      while (cur) {
        segments.unshift(`.children[${cur.index}]`)
        cur = cur.parent ? index.nodes.get(cur.parent.id) : undefined
      }
      return `pages[${entry.pageIndex}]${segments.join('')}`
    },
  }
}

/** Recherche directe, arrêtée au premier élément trouvé (document non gelé). */
function searchNode(doc: MaquetteDocument, id: string): NodeLocation | null {
  const visitList = (list: Node[], parent: FrameNode | null, page: Page, basePath: string): NodeLocation | null => {
    for (let index = 0; index < list.length; index++) {
      const node = list[index]!
      const path = `${basePath}.children[${index}]`
      if (node.id === id) return { node, parent, page, index, path }
      if (node.type === 'frame') {
        const found = visitList(node.children, node, page, path)
        if (found) return found
      }
    }
    return null
  }
  for (let pi = 0; pi < doc.pages.length; pi++) {
    const page = doc.pages[pi]!
    const found = visitList(page.children, null, page, `pages[${pi}]`)
    if (found) return found
  }
  return null
}

export function findNode(doc: MaquetteDocument, id: string): NodeLocation | null {
  const index = indexOf(doc)
  if (!index) return searchNode(doc, id)
  const entry = index.nodes.get(id)
  return entry ? locationOf(index, entry) : null
}

export function collectIds(doc: MaquetteDocument): Set<string> {
  const index = indexOf(doc)
  if (index) return new Set(index.ids)
  const ids = new Set<string>()
  doc.pages.forEach((p) => ids.add(p.id))
  doc.styles.colors.forEach((s) => ids.add(s.id))
  doc.styles.text.forEach((s) => ids.add(s.id))
  walk(doc, ({ node }) => ids.add(node.id))
  return ids
}

export function containsId(node: Node, id: string): boolean {
  if (node.id === id) return true
  return node.type === 'frame' && node.children.some((c) => containsId(c, id))
}
