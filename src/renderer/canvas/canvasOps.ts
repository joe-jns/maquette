import { instanceOverrides, isMain, ROOT_LOCAL_KEYS } from '../../core/components'
import type { Measure, Op } from '../../core/ops'
import { findNode, isFill, walk, type NodeLocation } from '../../core/tree'
import type { FrameNode, MaquetteDocument, Node, NodeInput, Rect, Size } from '../../core/types'

/** Lot d'opérations d'une commande et sélection à poser après application (identifiants réels ou `$…`). */
export interface CommandOps { ops: Op[]; select: string[] }

/** Fabrique d'identifiants temporaires uniques dans un lot. */
export function tempIds(prefix = 'n'): () => string {
  let k = 0
  return () => `$${prefix}${++k}`
}

/**
 * Éléments visés, dans l'ordre du document, sans ceux dont un ancêtre est aussi visé
 * (le sous-arbre de l'ancêtre les emporte déjà). Les identifiants inconnus sont ignorés.
 */
export function topLevel(doc: MaquetteDocument, ids: readonly string[]): NodeLocation[] {
  const wanted = new Set(ids)
  const covered = new Set<string>()
  const out: NodeLocation[] = []
  walk(doc, (loc) => {
    if (loc.parent && covered.has(loc.parent.id)) {
      covered.add(loc.node.id)
      return
    }
    if (wanted.has(loc.node.id)) {
      covered.add(loc.node.id)
      out.push(loc)
    }
  })
  return out
}

const parentRef = (loc: NodeLocation): string => loc.parent?.id ?? loc.page.id
const siblingsOf = (loc: NodeLocation): Node[] => (loc.parent ? loc.parent.children : loc.page.children)
const isAuto = (frame: FrameNode | null): boolean => frame?.layout.mode === 'auto'
/** L'élément est placé par la mise en page automatique de son parent (pas de x/y). */
export const inFlow = (loc: NodeLocation): boolean => isAuto(loc.parent) && loc.node.position === 'flow'

/** Rectangle d'un élément dans son parent : x/y du document, sinon la mesure ; tailles non numériques mesurées. */
export function rectIn(node: Node, measure?: Measure): Rect {
  const m = measure?.(node.id)
  const size = (axis: 'width' | 'height') => {
    const s = node[axis]
    return typeof s === 'number' ? s : m?.[axis] ?? 100
  }
  return { x: node.x ?? m?.x ?? 0, y: node.y ?? m?.y ?? 0, width: size('width'), height: size('height') }
}

/** Saisie de création équivalente à un élément existant (sans id ni enfants, sans lien d'instance). */
function toInput(node: Node): NodeInput {
  const { id: _id, ...rest } = structuredClone(node) as Node & { children?: Node[]; instanceOf?: string }
  delete rest.children
  delete rest.source
  delete rest.overrides
  delete rest.instanceOf
  return rest as NodeInput
}

/**
 * Copie d'un principal ou d'une instance dont le principal est dans `doc` : saisie d'une instance de
 * ce principal (propriétés locales de la racine, surcharges et `descendants`). Sinon null.
 */
function instanceInput(doc: MaquetteDocument | undefined, node: Node): Record<string, unknown> | null {
  if (!doc || node.type !== 'frame') return null
  const mainId = node.component ? node.id : node.instanceOf
  if (mainId === undefined || !isMain(findNode(doc, mainId)?.node)) return null
  const input: Record<string, unknown> = { type: 'frame', instanceOf: mainId }
  for (const key of ROOT_LOCAL_KEYS) {
    const value = (node as unknown as Record<string, unknown>)[key]
    if (key !== 'instanceOf' && value !== undefined) input[key] = structuredClone(value)
  }
  if (!node.component) {
    const { root, descendants } = instanceOverrides(doc, node)
    Object.assign(input, root)
    if (Object.keys(descendants).length) input.descendants = descendants
  }
  return input
}

/**
 * Recrée un sous-arbre : un `create` par élément, le parent des enfants étant l'identifiant
 * temporaire de leur cadre. `adjust` retouche la saisie de la racine seule. Renvoie l'identifiant
 * temporaire de la racine. Avec `doc` (document où l'on recrée), la copie d'un principal ou d'une
 * instance devient une instance du même principal ; sans son principal, une copie détachée.
 */
export function createSubtreeOps(
  node: Node,
  parent: string,
  index: number | undefined,
  tmp: () => string,
  ops: Op[],
  adjust?: (input: Record<string, unknown>) => void,
  doc?: MaquetteDocument,
): string {
  const id = tmp()
  const at = index === undefined ? {} : { index }
  const linked = instanceInput(doc, node)
  if (linked) {
    adjust?.(linked)
    ops.push({ op: 'create', parent, ...at, node: { ...(linked as NodeInput), id } })
    return id
  }
  const input = toInput(node) as unknown as Record<string, unknown>
  adjust?.(input)
  ops.push({ op: 'create', parent, ...at, node: { ...(input as NodeInput), id } })
  if (node.type === 'frame') for (const child of node.children) createSubtreeOps(child, id, undefined, tmp, ops, undefined, doc)
  return id
}

/** Supprimer (Suppr). */
export function deleteOps(doc: MaquetteDocument, ids: readonly string[]): CommandOps {
  return { ops: topLevel(doc, ids).map((loc) => ({ op: 'delete', id: loc.node.id })), select: [] }
}

/**
 * Dupliquer (Ctrl+D) : hors flux, décalé de +10/+10 ; en flux, juste après l'original. Dupliquer un
 * principal ou une instance crée une instance.
 */
export function duplicateOps(doc: MaquetteDocument, ids: readonly string[]): CommandOps {
  const tmp = tempIds('d')
  const ops: Op[] = []
  const select: string[] = []
  // Copies déjà insérées dans chaque parent : elles décalent les indices des suivants.
  const inserted = new Map<string, number>()
  for (const loc of topLevel(doc, ids)) {
    const parent = parentRef(loc)
    const shift = inserted.get(parent) ?? 0
    const flow = inFlow(loc)
    select.push(createSubtreeOps(loc.node, parent, loc.index + 1 + shift, tmp, ops, (input) => {
      if (!flow) {
        input.x = (loc.node.x ?? 0) + 10
        input.y = (loc.node.y ?? 0) + 10
      }
    }, doc))
    inserted.set(parent, shift + 1)
  }
  return { ops, select }
}

/** Chaîne des ancêtres (cadres) d'un élément, du parent direct à l'élément de premier niveau. */
function frameAncestors(doc: MaquetteDocument, loc: NodeLocation): FrameNode[] {
  const out: FrameNode[] = []
  let parent = loc.parent
  while (parent) {
    out.push(parent)
    parent = findNode(doc, parent.id)?.parent ?? null
  }
  return out
}

/**
 * Encadrer (Ctrl+Alt+G) : nouveau cadre « Cadre » sans remplissage dans le parent commun, à l'indice
 * du premier élément. Parent libre ou page : cadre libre à la boîte englobante, enfants replacés en
 * relatif. Parent automatique : cadre automatique `hug`×`hug` de même direction, enfants en flux.
 */
export function wrapInFrameOps(
  doc: MaquetteDocument,
  ids: readonly string[],
  measure: Measure,
  opts: { auto?: boolean } = {},
): CommandOps {
  const locs = topLevel(doc, ids)
  if (locs.length === 0) return { ops: [], select: [] }
  const first = locs[0]!
  const chains = locs.map((loc) => frameAncestors(doc, loc))
  // Parent commun le plus profond (null = la page du premier élément).
  const common = chains[0]!.find((f) => chains.every((c) => c.some((a) => a.id === f.id))) ?? null
  const sameParent = locs.every((loc) => (loc.parent?.id ?? null) === (common?.id ?? null))
  const page = first.page

  /** Position d'un élément ramenée dans le repère du parent commun. */
  const posInCommon = (loc: NodeLocation, chain: FrameNode[]): Rect => {
    const r = rectIn(loc.node, measure)
    for (const anc of chain) {
      if (anc.id === common?.id) break
      const a = rectIn(anc, measure)
      r.x += a.x
      r.y += a.y
    }
    return r
  }
  // Indice d'insertion : celui du premier élément, ou de son ancêtre placé dans le parent commun.
  let index = first.index
  if (!sameParent) {
    const chain = chains[0]!
    const k = chain.findIndex((f) => f.id === common?.id)
    const top = k === -1 ? chain[chain.length - 1] ?? null : k === 0 ? null : chain[k - 1]!
    const list = common ? common.children : page.children
    index = top ? list.findIndex((n) => n.id === top.id) : first.index
    if (index < 0) index = list.length
  }

  const tmp = tempIds('w')
  const wrapper = tmp()
  const ops: Op[] = []
  const commonAuto = common?.layout.mode === 'auto'
  const anyFlow = commonAuto && locs.some((loc) => !sameParent || loc.node.position === 'flow')
  const parent = common?.id ?? page.id

  if (anyFlow) {
    const direction = common?.layout.mode === 'auto' ? common.layout.direction : 'column'
    // Par axe : tous les enfants « fill » → le cadre remplit aussi ; certains seulement → taille
    // mesurée de l'ensemble (un cadre « hug » avec un enfant « fill » serait figé à une taille inconnue).
    const box = (rects: Rect[], axis: 'width' | 'height') =>
      axis === 'width'
        ? Math.max(...rects.map((r) => r.x + r.width)) - Math.min(...rects.map((r) => r.x))
        : Math.max(...rects.map((r) => r.y + r.height)) - Math.min(...rects.map((r) => r.y))
    const sizeFor = (axis: 'width' | 'height'): Size => {
      const fills = locs.filter((loc) => isFill(loc.node[axis])).length
      if (fills === 0) return { mode: 'hug' }
      if (fills === locs.length) return { mode: 'fill' }
      return Math.round(box(locs.map((loc) => rectIn(loc.node, measure)), axis))
    }
    ops.push({
      op: 'create', parent, index,
      node: { id: wrapper, type: 'frame', name: 'Frame', fills: [], width: sizeFor('width'), height: sizeFor('height'), layout: { mode: 'auto', direction } },
    })
    for (const loc of locs) {
      ops.push({ op: 'move', id: loc.node.id, parent: wrapper })
      if (loc.node.position === 'absolute') ops.push({ op: 'update', id: loc.node.id, set: { position: 'flow' } })
    }
    return { ops, select: [wrapper] }
  }

  // Cadre libre à la boîte englobante (ou automatique déduit des positions avec `opts.auto`).
  const rects = locs.map((loc, k) => posInCommon(loc, chains[k]!))
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.width))
  const maxY = Math.max(...rects.map((r) => r.y + r.height))
  const absolute = commonAuto // tous les éléments étaient hors flux dans un cadre automatique
  ops.push({
    op: 'create', parent, index,
    node: {
      id: wrapper, type: 'frame', name: 'Frame', fills: [],
      x: Math.round(minX), y: Math.round(minY),
      width: Math.round(maxX - minX), height: Math.round(maxY - minY),
      ...(absolute ? { position: 'absolute' as const } : {}),
    },
  })
  locs.forEach((loc, k) => {
    ops.push({ op: 'move', id: loc.node.id, parent: wrapper, x: Math.round(rects[k]!.x - minX), y: Math.round(rects[k]!.y - minY) })
  })
  if (opts.auto) ops.push(...autoLayoutFromPositions(wrapper, locs.map((l) => l.node.id), rects.map((r) => ({ ...r, x: r.x - minX, y: r.y - minY }))))
  return { ops, select: [wrapper] }
}

/**
 * Opérations qui passent un cadre libre en automatique en déduisant direction, ordre, espacement et
 * marges des positions de ses enfants (`rects`, dans le repère du cadre, même ordre que `childIds`).
 */
function autoLayoutFromPositions(frameId: string, childIds: string[], rects: Rect[]): Op[] {
  let direction: 'row' | 'column' = 'column'
  if (rects.length > 1) {
    const span = (lo: (r: Rect) => number, hi: (r: Rect) => number) =>
      Math.max(...rects.map(hi)) - Math.min(...rects.map(lo))
    const centersX = span((r) => r.x + r.width / 2, (r) => r.x + r.width / 2)
    const centersY = span((r) => r.y + r.height / 2, (r) => r.y + r.height / 2)
    if (centersX > centersY) direction = 'row'
  }
  const main = direction === 'row' ? ('x' as const) : ('y' as const)
  const cross = direction === 'row' ? ('y' as const) : ('x' as const)
  const size = direction === 'row' ? ('width' as const) : ('height' as const)
  const order = rects.map((r, k) => ({ r, id: childIds[k]!, k }))
    .sort((a, b) => a.r[main] - b.r[main] || a.r[cross] - b.r[cross] || a.k - b.k)
  const gaps = order.slice(1).map((e, k) => e.r[main] - (order[k]!.r[main] + order[k]!.r[size]))
  const gap = gaps.length ? Math.max(0, Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)) : 0
  const top = rects.length ? Math.max(0, Math.round(Math.min(...rects.map((r) => r.y)))) : 0
  const left = rects.length ? Math.max(0, Math.round(Math.min(...rects.map((r) => r.x)))) : 0
  const ops: Op[] = [{
    op: 'update', id: frameId,
    set: {
      layout: { mode: 'auto', direction, gap, padding: [top, left, top, left] },
      ...(rects.length ? { width: { mode: 'hug' }, height: { mode: 'hug' } } : {}),
    },
  }]
  ops.push(...reorderOps(frameId, childIds, order.map((e) => e.id)))
  return ops
}

/** Moves minimaux qui font passer la liste `current` (enfants de `parent`) à l'ordre `target`. */
function reorderOps(parent: string, current: readonly string[], target: readonly string[]): Op[] {
  const list = [...current]
  const ops: Op[] = []
  target.forEach((id, k) => {
    if (list[k] === id) return
    const from = list.indexOf(id)
    if (from < 0) return
    list.splice(from, 1)
    list.splice(k, 0, id)
    ops.push({ op: 'move', id, parent, index: k })
  })
  return ops
}

/**
 * Mise en page automatique (Maj+A). Un seul cadre libre sélectionné : il passe en automatique,
 * réglages déduits de la position de ses enfants. Sinon : les éléments sont encadrés dans un
 * cadre automatique.
 */
export function addAutoLayoutOps(doc: MaquetteDocument, ids: readonly string[], measure: Measure): CommandOps {
  const locs = topLevel(doc, ids)
  if (locs.length === 0) return { ops: [], select: [] }
  const only = locs[0]!.node
  if (locs.length === 1 && only.type === 'frame' && only.layout.mode === 'free') {
    const rects = only.children.map((c) => rectIn(c, measure))
    return { ops: autoLayoutFromPositions(only.id, only.children.map((c) => c.id), rects), select: [only.id] }
  }
  return wrapInFrameOps(doc, ids, measure, { auto: true })
}

/** Passe chaque élément choisi d'un rang vers la fin (`dir` = 1) ou le début (-1), en bloc. */
function stepSelected(list: string[], chosen: (id: string) => boolean, dir: 1 | -1): string[] {
  const out = [...list]
  const range = dir === 1 ? [...out.keys()].reverse() : [...out.keys()]
  for (const i of range) {
    const j = i + dir
    if (j < 0 || j >= out.length || !chosen(out[i]!) || chosen(out[j]!)) continue
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** Groupe les éléments visés par parent. */
function byParent(locs: NodeLocation[]): Map<string, NodeLocation[]> {
  const groups = new Map<string, NodeLocation[]>()
  for (const loc of locs) groups.set(parentRef(loc), [...(groups.get(parentRef(loc)) ?? []), loc])
  return groups
}

/** Ordre d'empilement (Ctrl+] / Ctrl+[ …) : dans le même parent, ordre relatif gardé. */
export function zOrderOps(
  doc: MaquetteDocument,
  ids: readonly string[],
  to: 'forward' | 'backward' | 'front' | 'back',
): CommandOps {
  const locs = topLevel(doc, ids)
  const ops: Op[] = []
  for (const [parent, group] of byParent(locs)) {
    const current = siblingsOf(group[0]!).map((n) => n.id)
    const chosen = new Set(group.map((l) => l.node.id))
    const is = (id: string) => chosen.has(id)
    let target: string[]
    if (to === 'front') target = [...current.filter((id) => !is(id)), ...current.filter(is)]
    else if (to === 'back') target = [...current.filter(is), ...current.filter((id) => !is(id))]
    else target = stepSelected(current, is, to === 'forward' ? 1 : -1)
    ops.push(...reorderOps(parent, current, target))
  }
  return { ops, select: locs.map((l) => l.node.id) }
}

/**
 * Flèches : hors flux, `x += dx`, `y += dy` ; en flux, l'axe principal du cadre automatique fait
 * changer l'élément de rang parmi ses frères en flux (l'autre axe est ignoré).
 */
export function nudgeOps(doc: MaquetteDocument, ids: readonly string[], dx: number, dy: number): CommandOps {
  const locs = topLevel(doc, ids)
  const ops: Op[] = []
  const flowGroups = new Map<string, NodeLocation[]>()
  for (const loc of locs) {
    if (inFlow(loc)) {
      flowGroups.set(parentRef(loc), [...(flowGroups.get(parentRef(loc)) ?? []), loc])
      continue
    }
    if (dx === 0 && dy === 0) continue
    ops.push({ op: 'update', id: loc.node.id, set: { x: (loc.node.x ?? 0) + dx, y: (loc.node.y ?? 0) + dy } })
  }
  for (const [parent, group] of flowGroups) {
    const frame = group[0]!.parent!
    if (frame.layout.mode !== 'auto') continue
    const delta = frame.layout.direction === 'row' ? dx : dy
    if (delta === 0) continue
    const current = frame.children.map((n) => n.id)
    // Seuls les frères en flux comptent : un frère hors flux n'occupe pas de rang.
    const flowIds = frame.children.filter((n) => n.position === 'flow').map((n) => n.id)
    const chosen = new Set(group.map((l) => l.node.id))
    const stepped = stepSelected(flowIds, (id) => chosen.has(id), delta > 0 ? 1 : -1)
    let k = 0
    const target = current.map((id) => (flowIds.includes(id) ? stepped[k++]! : id))
    ops.push(...reorderOps(parent, current, target))
  }
  return { ops, select: locs.map((l) => l.node.id) }
}
