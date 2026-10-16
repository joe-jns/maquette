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

export function findNode(doc: MaquetteDocument, id: string): NodeLocation | null {
  let found: NodeLocation | null = null
  walk(doc, (loc) => {
    if (!found && loc.node.id === id) found = loc
  })
  return found
}

export function collectIds(doc: MaquetteDocument): Set<string> {
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
