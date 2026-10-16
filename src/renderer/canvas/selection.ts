import { findNode } from '../../core/tree'
import type { MaquetteDocument, Node, Rect } from '../../core/types'

/** `outer` contient `inner`, à `tolerance` près sur chaque bord. */
function containsRect(outer: Rect, inner: Rect, tolerance: number): boolean {
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance
}

/** Les deux rectangles se chevauchent (un simple contact ne compte pas). */
function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Contexte de sélection d'un élément : l'identifiant de son parent, `null` s'il est posé sur la page. */
export function contextOf(doc: MaquetteDocument, id: string): string | null {
  return findNode(doc, id)?.parent?.id ?? null
}

/** Chaîne `id → parent → … → élément de premier niveau`. */
function ancestry(doc: MaquetteDocument, id: string): string[] {
  const chain: string[] = []
  let current: string | null = findNode(doc, id) ? id : null
  while (current !== null) {
    chain.push(current)
    current = contextOf(doc, current)
  }
  return chain
}

/**
 * Élément sélectionné par un clic sur `hitId` (l'élément le plus profond sous le pointeur).
 * Sans `deep` : l'élément de la chaîne dont le parent est le contexte courant, sinon l'élément de
 * premier niveau. Avec `deep` (Ctrl+clic) : l'élément touché, sauf s'il recouvre entièrement son
 * parent, auquel cas le parent garde le clic (on remonte tant que c'est le cas).
 */
export function pickClickTarget(
  doc: MaquetteDocument,
  hitId: string,
  opts: { deep: boolean; context: string | null; rectOf?: (id: string) => Rect | undefined },
): string {
  const chain = ancestry(doc, hitId)
  if (chain.length === 0) return hitId
  if (!opts.deep) {
    return chain.find((id) => contextOf(doc, id) === opts.context) ?? chain[chain.length - 1]!
  }
  let k = 0
  while (opts.rectOf && k + 1 < chain.length) {
    const own = opts.rectOf(chain[k]!)
    const parent = opts.rectOf(chain[k + 1]!)
    if (!own || !parent || !containsRect(own, parent, 0.5) || !containsRect(parent, own, 0.5)) break
    k++
  }
  return chain[k]!
}

/** Premier enfant d'un cadre (Entrée), `null` s'il n'en a pas. */
export function descend(doc: MaquetteDocument, id: string): string | null {
  const node = findNode(doc, id)?.node
  return node?.type === 'frame' ? node.children[0]?.id ?? null : null
}

/** Parent de l'élément (Maj+Entrée), `null` sur la page. */
export function ascend(doc: MaquetteDocument, id: string): string | null {
  return contextOf(doc, id)
}

/** Frère suivant (`dir` = 1) ou précédent (-1), en boucle. */
export function nextSibling(doc: MaquetteDocument, id: string, dir: 1 | -1): string {
  const loc = findNode(doc, id)
  if (!loc) return id
  const list = loc.parent ? loc.parent.children : loc.page.children
  return list[(loc.index + dir + list.length) % list.length]!.id
}

/**
 * Sélection au lasso : enfants du contexte (ou de la page) qui chevauchent `marquee`, dans l'ordre
 * du document. Les éléments masqués ou verrouillés ne sont pas pris (comme Figma).
 */
export function marqueeSelect(
  doc: MaquetteDocument,
  pageId: string,
  context: string | null,
  rectOf: (id: string) => Rect | undefined,
  marquee: Rect,
): string[] {
  let list: Node[] = []
  if (context === null) list = doc.pages.find((p) => p.id === pageId)?.children ?? []
  else {
    const node = findNode(doc, context)?.node
    if (node?.type === 'frame') list = node.children
  }
  return list
    .filter((n) => n.visible && !n.locked)
    .filter((n) => {
      const r = rectOf(n.id)
      return r !== undefined && intersects(r, marquee)
    })
    .map((n) => n.id)
}
