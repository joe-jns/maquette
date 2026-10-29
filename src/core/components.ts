import { current, isDraft } from 'immer'
import { newId as makeId } from './ids'
import { findNode, walk } from './tree'
import type { FrameNode, MaquetteDocument, Node } from './types'

/**
 * Composants « copie liée » (spec 2026-10-29, étape 2).
 *
 * - Composant principal : un cadre avec `component: true`.
 * - Instance : un cadre avec `instanceOf: <id du principal>`. Ses enfants sont de vrais calques copiés ;
 *   chacun porte `source` (id du calque correspondant dans le principal) et `overrides` (propriétés
 *   modifiées localement). Position, taille, nom… de la racine restent toujours locaux.
 * - Instance imbriquée : un principal M contient une instance I1 de N. Une instance J de M contient la
 *   copie J1 de I1 : J1 porte `source: I1` et `instanceOf: N` (pour l'affichage), mais elle est
 *   synchronisée depuis I1, avec le reste de J. Les `source` des calques de J désignent donc toujours
 *   des calques du sous-arbre de M, à n'importe quelle profondeur.
 * - Calque local (sans `source`) dans une instance : contenu d'un slot ou sous-arbre remplacé à
 *   l'import d'un .pen ; la synchronisation le laisse à son rang, sans y toucher.
 *
 * Tout le module travaille sur des objets ordinaires ou des brouillons Immer : la lecture passe par des
 * instantanés (`plain`), l'écriture ne touche que ce qui change (patchs d'annulation minimaux).
 */

type Bag = Record<string, unknown>

/** Propriétés propres à chaque calque, jamais recopiées du principal. */
const OWN_KEYS = new Set(['id', 'type', 'children', 'source', 'overrides', 'component'])

/** Racine d'une instance : propriétés toujours locales (position, taille, nom, visibilité…). */
export const ROOT_LOCAL_KEYS: ReadonlySet<string> = new Set([
  'instanceOf', 'name', 'x', 'y', 'width', 'height', 'position', 'alignSelf',
  'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'visible', 'locked',
])

/** Surcharge d'une liste d'enfants : la synchronisation n'ajoute, ne retire ni ne réordonne plus rien. */
export const CHILDREN_OVERRIDE = 'children'

export const isMain = (n: Node | undefined | null): n is FrameNode & { component: true } => n?.type === 'frame' && n.component === true
/** Racine d'instance : suit un principal sans être elle-même la copie d'un calque (instance imbriquée). */
export const isInstanceRoot = (n: Node | undefined | null): n is FrameNode & { instanceOf: string } =>
  n?.type === 'frame' && n.instanceOf !== undefined && n.source === undefined
/** Calque qui appartient à une instance (racine ou copie). */
export const inInstance = (n: Node): boolean => n.source !== undefined || isInstanceRoot(n)

/** Instantané lisible d'un calque (un brouillon Immer est figé, un objet ordinaire rendu tel quel). */
export const plain = <T>(v: T): T => (isDraft(v) ? (current(v as never) as T) : v)

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual((a as Bag)[k], (b as Bag)[k]))
}

const clone = <T>(v: T): T => (typeof v === 'object' && v !== null ? structuredClone(v) : v)

// ——— Synchronisation d'une instance (fonctions pures) ———

/**
 * Copie neuve d'un calque du principal pour une instance : nouveaux ids, `source` vers l'original,
 * sans `overrides` ni `component` (une copie n'est jamais un principal).
 */
function freshCopy(m: Node, newId: () => string): Node {
  const { children, overrides: _o, component: _c, ...rest } = m as Node & { children?: Node[]; component?: true }
  const copy = { ...structuredClone(rest), id: newId(), source: m.id } as Bag
  if (children) copy.children = children.map((c) => freshCopy(c, newId))
  return copy as unknown as Node
}

/** Calques copiés d'une instance, par `source` (sans entrer dans les instances indépendantes ni les slots). */
function collectPool(node: Node, pool: Map<string, Node>, root: boolean): void {
  if (!root) {
    if (node.source === undefined) return
    if (!pool.has(node.source)) pool.set(node.source, node)
  }
  if (node.type === 'frame' && !node.overrides?.includes(CHILDREN_OVERRIDE)) {
    for (const c of node.children) collectPool(c, pool, false)
  }
}

interface SyncState { pool: Map<string, Node>; used: Set<Node>; newId: () => string }

function syncNode(inst: Node, main: Node, root: boolean, st: SyncState): Node {
  // Calque remplacé par un autre type (import d'un .pen) : local, rien à recopier.
  if (inst.type !== main.type) return inst
  const ov = new Set(inst.overrides ?? [])
  const skip = (k: string) => OWN_KEYS.has(k) || ov.has(k) || (root && ROOT_LOCAL_KEYS.has(k))
  const src = inst as unknown as Bag
  const m = main as unknown as Bag
  let out: Bag = src
  const set = (k: string, v: unknown) => {
    if (out === src) out = { ...src }
    if (v === undefined) delete out[k]
    else out[k] = v
  }
  for (const k of Object.keys(m)) if (!skip(k) && !deepEqual(src[k], m[k])) set(k, clone(m[k]))
  for (const k of Object.keys(src)) if (!skip(k) && !(k in m)) set(k, undefined)
  if (inst.type === 'frame' && main.type === 'frame' && !ov.has(CHILDREN_OVERRIDE)) {
    const next: Node[] = []
    for (const mc of main.children) {
      const existing = st.pool.get(mc.id)
      if (existing && !st.used.has(existing)) {
        st.used.add(existing)
        next.push(syncNode(existing, mc, false, st))
      } else next.push(freshCopy(mc, st.newId))
    }
    // Calques locaux (slot, remplacement) : gardés à leur rang.
    inst.children.forEach((c, k) => {
      if (c.source === undefined) next.splice(Math.min(k, next.length), 0, c)
    })
    const same = next.length === inst.children.length && next.every((c, k) => c === inst.children[k])
    if (!same) set('children', next)
  }
  return out as unknown as Node
}

/**
 * Instance remise d'accord avec son principal (objets ordinaires, entrées intactes) : propriétés non
 * surchargées recopiées, calques ajoutés, retirés ou réordonnés dans le principal reportés (nouveaux
 * ids pour les ajouts). Renvoie `inst` lui-même si rien ne change.
 */
export function syncInstanceTree(inst: FrameNode, main: FrameNode, newId: () => string): FrameNode {
  const pool = new Map<string, Node>()
  collectPool(inst, pool, true)
  return syncNode(inst, main, true, { pool, used: new Set(), newId }) as FrameNode
}

/**
 * Nouvelle instance de `main` (objet ordinaire, non inséré) : copie complète, nouveaux ids. Position,
 * taille et nom reprennent ceux du principal ; à l'appelant de les ajuster (x/y, taille "fill").
 */
export function instanceOfMain(main: FrameNode, newId: () => string): FrameNode {
  const root = freshCopy(main, newId) as FrameNode
  delete root.source
  root.instanceOf = main.id
  delete root.alignSelf
  return root
}

/** Écrit dans `target` (brouillon ou objet) ce qui diffère entre `old` et `next` : patchs minimaux. */
function writeDiff(target: Node, old: Node, next: Node): void {
  if (old === next) return
  const t = target as unknown as Bag
  const o = old as unknown as Bag
  const n = next as unknown as Bag
  for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
    if (o[k] === n[k]) continue
    if (!(k in n)) {
      delete t[k]
      continue
    }
    if (k === 'children' && Array.isArray(o[k]) && Array.isArray(n[k])) {
      const oc = o[k] as Node[]
      const nc = n[k] as Node[]
      if (oc.length === nc.length && oc.every((c, i) => c.id === nc[i]!.id)) {
        const tc = t[k] as Node[]
        nc.forEach((c, i) => writeDiff(tc[i]!, oc[i]!, c))
        continue
      }
    }
    t[k] = n[k]
  }
}

// ——— Propagation dans un document ———

export interface Located { node: Node; parent: FrameNode | null }

/** Accès au document pendant une propagation (brouillon d'applyOps, ou document modifiable). */
export interface SyncEnv {
  locate(id: string): Located | null
  /** Racines d'instances connues d'un principal (des ids périmés sont permis). */
  rootsOf(mainId: string): Iterable<string>
  newId(): string
  /** Instance réécrite (pour tenir à jour un index). */
  synced?(root: FrameNode): void
}

export class ComponentCycleError extends Error {}

/** Principaux qui contiennent `id` (lui compris), du plus proche au plus lointain. */
export function enclosingMains(env: Pick<SyncEnv, 'locate'>, id: string): string[] {
  const out: string[] = []
  let loc = env.locate(id)
  while (loc) {
    if (isMain(loc.node)) out.push(loc.node.id)
    loc = loc.parent ? env.locate(loc.parent.id) : null
  }
  return out
}

/** Principaux dont une instance (racine ou copie) se trouve dans `node` (lui compris). */
export function instanceMainsIn(node: Node, into = new Set<string>()): Set<string> {
  if (node.type === 'frame') {
    if (node.instanceOf !== undefined) into.add(node.instanceOf)
    for (const c of node.children) instanceMainsIn(c, into)
  }
  return into
}

/**
 * Vrai si le principal `from` est `target` ou contient, directement ou par ses instances, une instance
 * de `target` : poser une instance de `from` dans `target` ferait une boucle.
 */
export function reaches(env: Pick<SyncEnv, 'locate'>, from: string, target: string): boolean {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const m = stack.pop()!
    if (m === target) return true
    if (seen.has(m)) continue
    seen.add(m)
    const loc = env.locate(m)
    if (loc) stack.push(...instanceMainsIn(plain(loc.node)))
  }
  return false
}

/** Une instance remise d'accord ; vrai si elle a changé. */
function syncRoot(env: SyncEnv, loc: Located): boolean {
  const inst = loc.node as FrameNode
  const main = env.locate(inst.instanceOf!)?.node
  if (!isMain(main)) return false
  const before = plain(inst)
  const next = syncInstanceTree(before, plain(main), env.newId)
  if (next === before) return false
  writeDiff(inst, before, next)
  env.synced?.(inst)
  return true
}

/**
 * Remet d'accord les instances des principaux `mains` (et les racines `roots`), dans l'ordre des
 * dépendances : un principal passe après ceux dont il contient des instances, et une instance mise à
 * jour à l'intérieur d'un principal rend ce principal à son tour « touché ». Une boucle lève
 * ComponentCycleError.
 */
export function propagate(env: SyncEnv, mains: Iterable<string>, roots: Iterable<string> = []): void {
  const pendingMains = new Set(mains)
  const pendingRoots = new Set(roots)
  const nameOf = (id: string) => env.locate(id)?.node.name ?? id
  for (let guard = 0; pendingMains.size || pendingRoots.size; guard++) {
    if (guard > 100_000) throw new ComponentCycleError('synchronisation des composants interrompue (boucle)')
    // 1. Instances dont le principal est à jour.
    for (const r of [...pendingRoots]) {
      const loc = env.locate(r)
      if (!loc || !isInstanceRoot(loc.node)) {
        pendingRoots.delete(r)
        continue
      }
      if (pendingMains.has(loc.node.instanceOf!)) continue
      pendingRoots.delete(r)
      if (syncRoot(env, loc)) for (const m of enclosingMains(env, r)) pendingMains.add(m)
    }
    if (!pendingMains.size) {
      if (pendingRoots.size) throw new ComponentCycleError('synchronisation des composants interrompue (boucle)')
      return
    }
    // 2. Un principal touché dont aucune dépendance n'attend : ses instances passent à l'étape 1.
    const ready = [...pendingMains].find((m) => {
      const loc = env.locate(m)
      if (!loc) return true
      for (const dep of instanceMainsIn(plain(loc.node))) if (pendingMains.has(dep)) return false
      return true
    })
    if (ready === undefined) {
      const m = [...pendingMains][0]!
      throw new ComponentCycleError(`boucle : le composant « ${nameOf(m)} » contient une instance de lui-même (directement ou par un autre composant)`)
    }
    pendingMains.delete(ready)
    if (env.locate(ready)) for (const r of env.rootsOf(ready)) pendingRoots.add(r)
  }
}

// ——— Détacher, rétablir ———

const union = (...lists: (string[] | undefined)[]): string[] | undefined => {
  const set = new Set(lists.flatMap((l) => l ?? []))
  return set.size ? [...set].sort() : undefined
}

const setOverrides = (n: Node, list: string[] | undefined) => {
  if (list?.length) n.overrides = list
  else delete n.overrides
}

const strip = (n: Node) => {
  delete n.source
  delete n.overrides
}

/** Retire tout lien de composant d'un sous-arbre local (copie qui devient un calque ordinaire). */
function stripAll(n: Node): void {
  strip(n)
  if (n.type === 'frame') {
    delete n.instanceOf
    n.children.forEach(stripAll)
  }
}

/**
 * Une instance imbriquée (copie K de I1, `instanceOf: N`) devient une instance indépendante de N :
 * ses calques désignaient les calques de I1, ils désignent maintenant ceux de N (un cran plus loin
 * dans la chaîne des sources) ; les surcharges de I1 deviennent les siennes.
 */
function promote(k: FrameNode, lookup: (id: string) => Node | undefined): void {
  const src = lookup(k.source!)
  setOverrides(k, union(k.overrides, src?.overrides)?.filter((key) => !ROOT_LOCAL_KEYS.has(key)))
  delete k.source
  const visit = (d: Node) => {
    if (d.source === undefined) return
    const e = lookup(d.source)
    if (e?.source === undefined) {
      stripAll(d)
      return
    }
    d.source = e.source
    setOverrides(d, union(d.overrides, e.overrides))
    if (d.type === 'frame') d.children.forEach(visit)
  }
  k.children.forEach(visit)
}

/**
 * Détache une instance (racine) : elle et ses copies deviennent des calques ordinaires. Les instances
 * imbriquées restent des instances (de leur propre principal). `lookup` lit les calques du document
 * (instantanés). Renvoie les instances imbriquées promues.
 */
export function detachTree(root: FrameNode, lookup: (id: string) => Node | undefined): FrameNode[] {
  const promoted: FrameNode[] = []
  delete root.instanceOf
  delete root.overrides
  const visit = (n: Node) => {
    if (n.source === undefined) return
    if (n.type === 'frame' && n.instanceOf !== undefined) {
      promote(n, lookup)
      promoted.push(n)
      return
    }
    strip(n)
    if (n.type === 'frame') n.children.forEach(visit)
  }
  root.children.forEach(visit)
  return promoted
}

/** Rétablit le principal : vide les surcharges de `node` et des calques de l'instance qu'il contient. */
export function clearOverrides(node: Node, root = true): void {
  if (!root && node.source === undefined) return
  delete node.overrides
  if (node.type === 'frame') for (const c of node.children) clearOverrides(c, false)
}

// ——— Surcharges (pour l'import et les outils) ———

/**
 * Modifie des propriétés d'un calque d'instance (objet ordinaire) en les notant comme surcharges.
 * Sur la racine, les propriétés toujours locales (position, taille, nom…) ne sont pas notées.
 */
export function overrideProps(node: Node, props: Record<string, unknown>): void {
  const bag = node as unknown as Bag
  for (const [k, v] of Object.entries(props)) {
    if (OWN_KEYS.has(k)) continue
    if (v === null || v === undefined) delete bag[k]
    else bag[k] = v
  }
  noteOverrides(node, Object.keys(props))
}

/** Ajoute des propriétés aux surcharges d'un calque d'instance (sauf celles toujours propres ou locales). */
export function noteOverrides(node: Node, keys: Iterable<string>): void {
  const root = isInstanceRoot(node)
  const kept = [...keys].filter((k) => !OWN_KEYS.has(k) && !(root && ROOT_LOCAL_KEYS.has(k)))
  if (kept.length) setOverrides(node, union(node.overrides, kept))
}

/** Propriétés d'un calque, hors enfants, en instantanés comparables (avant une modification). */
export function snapshotProps(node: Node): Bag {
  const out: Bag = {}
  for (const [k, v] of Object.entries(node)) if (k !== 'children') out[k] = plain(v)
  return out
}

/** Propriétés qui diffèrent entre un instantané et l'état actuel du calque. */
export function changedProps(before: Bag, node: Node): string[] {
  const now = node as unknown as Bag
  const keys = new Set([...Object.keys(before), ...Object.keys(now)])
  keys.delete('children')
  return [...keys].filter((k) => !deepEqual(before[k], plain(now[k])))
}

/**
 * Enfants locaux d'un calque d'instance (contenu d'un slot) : la synchronisation ne touche plus sa
 * liste d'enfants. Les calques donnés sont pris tels quels, sans lien.
 */
export function setLocalChildren(node: FrameNode, children: Node[]): void {
  children.forEach(stripAll)
  node.children = children
  setOverrides(node, union(node.overrides, [CHILDREN_OVERRIDE]))
}

/**
 * Remplace un calque d'instance par un autre sous-arbre (remplacement complet, import d'un .pen) :
 * le remplaçant garde la place (`source` du calque remplacé) mais toutes ses propriétés et ses enfants
 * sont locaux. Renvoie le remplaçant tel qu'inséré.
 */
export function replaceInInstance(parent: FrameNode, node: Node, replacement: Node): Node {
  const index = parent.children.indexOf(node)
  if (index < 0) throw new Error('replaceInInstance : le calque n’est pas un enfant de ce parent')
  stripAll(replacement)
  replacement.source = node.source
  const keys = Object.keys(replacement).filter((k) => !OWN_KEYS.has(k))
  if (replacement.type === 'frame') keys.push(CHILDREN_OVERRIDE)
  setOverrides(replacement, union(keys))
  parent.children[index] = replacement
  return replacement
}

/**
 * Calque d'une instance désigné par un chemin d'ids du principal, à la manière des `descendants` de
 * Pen : `"a"` = la copie du calque `a` du principal ; `"i/b"` = dans la copie de l'instance imbriquée
 * `i`, la copie du calque `b` de son propre principal. `null` si introuvable.
 */
export function findInInstance(doc: MaquetteDocument, root: FrameNode, path: string | string[]): Node | null {
  const segments = typeof path === 'string' ? path.split('/') : path
  const chain = (n: Node, depth: number): string | undefined => {
    let s = n.source
    for (let k = 1; k < depth && s !== undefined; k++) s = findNode(doc, s)?.node.source
    return s
  }
  let scope: Node = root
  for (let k = 0; k < segments.length; k++) {
    let found: Node | null = null
    const visit = (n: Node): void => {
      if (found || n.source === undefined) return
      if (chain(n, k + 1) === segments[k]) {
        found = n
        return
      }
      if (n.type === 'frame' && !n.overrides?.includes(CHILDREN_OVERRIDE)) n.children.forEach(visit)
    }
    if (scope.type === 'frame') scope.children.forEach(visit)
    if (!found) return null
    scope = found
  }
  return scope
}

/**
 * Surcharges d'une instance (racine ou imbriquée) exprimées dans l'espace de son principal : props
 * de la racine et `descendants` par id de calque du principal. Sert à copier une instance.
 */
export function instanceOverrides(doc: MaquetteDocument, inst: FrameNode): { root: Bag; descendants: Record<string, Bag> } {
  const mainId = inst.instanceOf!
  const inMain = (id: string) => {
    for (let loc = findNode(doc, id); loc; loc = loc.parent ? findNode(doc, loc.parent.id) : null) {
      if (loc.node.id === mainId) return true
    }
    return false
  }
  const pick = (n: Node, keys: Iterable<string>, root: boolean): Bag => {
    const out: Bag = {}
    for (const k of keys) {
      if (OWN_KEYS.has(k) || (root && ROOT_LOCAL_KEYS.has(k))) continue
      const v = (n as unknown as Bag)[k]
      out[k] = v === undefined ? null : clone(v)
    }
    return out
  }
  // Racine : ses surcharges et celles des calques dont elle est la copie.
  let keys = new Set(inst.overrides ?? [])
  for (let s = inst.source; s !== undefined;) {
    const n = findNode(doc, s)?.node
    n?.overrides?.forEach((k) => keys.add(k))
    s = n?.source
  }
  const root = pick(inst, keys, true)
  const descendants: Record<string, Bag> = {}
  const visit = (d: Node) => {
    if (d.source === undefined) return
    keys = new Set(d.overrides ?? [])
    let s: string | undefined = d.source
    let key: string | undefined
    while (s !== undefined) {
      if (inMain(s)) {
        key = s
        break
      }
      const n: Node | undefined = findNode(doc, s)?.node
      n?.overrides?.forEach((k) => keys.add(k))
      s = n?.source
    }
    const props = key === undefined ? {} : pick(d, keys, false)
    if (key !== undefined && Object.keys(props).length) descendants[key] = props
    if (d.type === 'frame' && !d.overrides?.includes(CHILDREN_OVERRIDE)) d.children.forEach(visit)
  }
  inst.children.forEach(visit)
  return { root, descendants }
}

// ——— Documents entiers (import, ouverture) ———

/** Index modifiable d'un document ordinaire, tenu à jour après chaque instance réécrite. */
function plainEnv(doc: MaquetteDocument): SyncEnv & { mains: string[] } {
  const nodes = new Map<string, Located>()
  const roots = new Map<string, string[]>()
  const mains: string[] = []
  const taken = new Set<string>()
  doc.pages.forEach((p) => taken.add(p.id))
  doc.styles.colors.forEach((s) => taken.add(s.id))
  doc.styles.text.forEach((s) => taken.add(s.id))
  const index = (node: Node, parent: FrameNode | null) => {
    nodes.set(node.id, { node, parent })
    taken.add(node.id)
    if (node.type === 'frame') node.children.forEach((c) => index(c, node))
  }
  walk(doc, ({ node, parent }) => {
    nodes.set(node.id, { node, parent })
    taken.add(node.id)
    if (isMain(node)) mains.push(node.id)
    if (isInstanceRoot(node)) roots.set(node.instanceOf!, [...(roots.get(node.instanceOf!) ?? []), node.id])
  })
  return {
    mains,
    locate: (id) => nodes.get(id) ?? null,
    rootsOf: (m) => roots.get(m) ?? [],
    newId: () => {
      const id = makeId(taken)
      taken.add(id)
      return id
    },
    synced: (root) => index(root, nodes.get(root.id)?.parent ?? null),
  }
}

/**
 * Remet chaque instance du document d'accord avec son principal (dans l'ordre des dépendances).
 * Fonction pure : renvoie `doc` lui-même s'il n'a pas d'instance ou si rien ne change, sinon une
 * copie. Lève ComponentCycleError sur une boucle.
 */
export function syncInstances(doc: MaquetteDocument): MaquetteDocument {
  let any = false
  walk(doc, ({ node }) => {
    if (isInstanceRoot(node)) any = true
  })
  if (!any) return doc
  const copy = structuredClone(doc)
  const before = JSON.stringify(copy)
  const env = plainEnv(copy)
  propagate(env, env.mains)
  return JSON.stringify(copy) === before ? doc : copy
}

/**
 * Nouvelle instance du principal `mainId` du document (objet ordinaire, à insérer par l'appelant),
 * à x = y = 0 en flux. Une taille "fill" du principal devient "hug" (cadre automatique) ou 100 px.
 * `taken` : ids déjà pris (sinon ceux du document) ; les ids attribués y sont ajoutés.
 */
export function instantiate(
  doc: MaquetteDocument,
  mainId: string,
  taken?: { has(id: string): boolean; add(id: string): void },
): FrameNode {
  const main = findNode(doc, mainId)?.node
  if (!isMain(main)) throw new Error(`instantiate : ${mainId} n’est pas un composant principal`)
  const ids = taken ?? (() => {
    const set = new Set<string>()
    doc.pages.forEach((p) => set.add(p.id))
    doc.styles.colors.forEach((s) => set.add(s.id))
    doc.styles.text.forEach((s) => set.add(s.id))
    walk(doc, ({ node }) => set.add(node.id))
    return set
  })()
  const root = instanceOfMain(plain(main), () => {
    const id = makeId(ids)
    ids.add(id)
    return id
  })
  root.position = 'flow'
  root.x = 0
  root.y = 0
  for (const k of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const) delete root[k]
  for (const axis of ['width', 'height'] as const) {
    const s = root[axis]
    if (typeof s === 'object' && s.mode === 'fill') root[axis] = root.layout.mode === 'auto' ? { mode: 'hug' } : 100
  }
  return root
}

// ——— Cohérence (validation, réparation) ———

interface Entry { node: Node; parent: Entry | null; path: string }

/** Tous les calques avec leur parent et leur chemin ; `linked` = le document a des composants. */
function entriesOf(doc: MaquetteDocument): { list: Entry[]; byId: Map<string, Entry>; linked: boolean } {
  const list: Entry[] = []
  const byId = new Map<string, Entry>()
  let linked = false
  const visit = (nodes: Node[], parent: Entry | null, base: string) => {
    nodes.forEach((node, k) => {
      const e: Entry = { node, parent, path: `${base}.children[${k}]` }
      list.push(e)
      if (!byId.has(node.id)) byId.set(node.id, e)
      if (node.source !== undefined || node.overrides !== undefined || (node.type === 'frame' && (node.component !== undefined || node.instanceOf !== undefined))) linked = true
      if (node.type === 'frame') visit(node.children, e, e.path)
    })
  }
  doc.pages.forEach((p, pi) => visit(p.children, null, `pages[${pi}]`))
  return { list, byId, linked }
}

const ownerOf = (e: Entry): Entry | null => {
  for (let p = e.parent; p; p = p.parent) if (isInstanceRoot(p.node)) return p
  return null
}

const isInside = (byId: Map<string, Entry>, id: string, ancestor: string): boolean => {
  for (let e = byId.get(id); e; e = e.parent ?? undefined) if (e.node.id === ancestor) return true
  return false
}

type Problem =
  | { kind: 'copy-main'; e: Entry }
  | { kind: 'orphan'; e: Entry }
  | { kind: 'nested-orphan'; e: Entry }
  | { kind: 'source'; e: Entry; why: 'outside' | 'unknown' | 'duplicate' }
  | { kind: 'cycle'; e: Entry }

function problems(doc: MaquetteDocument): { problems: Problem[]; byId: Map<string, Entry> } {
  const { list, byId, linked } = entriesOf(doc)
  const out: Problem[] = []
  if (!linked) return { problems: out, byId }
  const seen = new Set<string>()
  for (const e of list) {
    const n = e.node
    if (n.type === 'frame' && n.component && n.source !== undefined) out.push({ kind: 'copy-main', e })
    if (n.type === 'frame' && n.instanceOf !== undefined && !isMain(byId.get(n.instanceOf)?.node)) {
      out.push({ kind: n.source === undefined ? 'orphan' : 'nested-orphan', e })
    }
    if (n.source === undefined) continue
    const owner = ownerOf(e)
    if (!owner) {
      out.push({ kind: 'source', e, why: 'outside' })
      continue
    }
    const mainId = (owner.node as FrameNode).instanceOf!
    if (!isMain(byId.get(mainId)?.node)) continue
    if (!isInside(byId, n.source, mainId) || n.source === mainId) out.push({ kind: 'source', e, why: 'unknown' })
    else if (seen.has(`${owner.node.id}/${n.source}`)) out.push({ kind: 'source', e, why: 'duplicate' })
    else seen.add(`${owner.node.id}/${n.source}`)
  }
  // Boucles : un principal qui dépend de lui-même par ses instances.
  const deps = new Map<string, Set<string>>()
  for (const e of list) if (isMain(e.node)) deps.set(e.node.id, instanceMainsIn(e.node))
  const env: Pick<SyncEnv, 'locate'> = { locate: (id) => (deps.has(id) ? { node: byId.get(id)!.node, parent: null } : null) }
  for (const [m, d] of deps) {
    if ([...d].some((x) => reaches(env, x, m))) out.push({ kind: 'cycle', e: byId.get(m)! })
  }
  return { problems: out, byId }
}

/** Incohérences des composants d'un document (validation complète). */
export function componentIssues(doc: MaquetteDocument): { path: string; message: string }[] {
  return problems(doc).problems.map((p) => {
    const n = p.e.node
    switch (p.kind) {
      case 'copy-main':
        return { path: `${p.e.path}.component`, message: 'un calque copié dans une instance ne peut pas être un composant principal' }
      case 'orphan':
      case 'nested-orphan':
        return { path: `${p.e.path}.instanceOf`, message: `composant principal introuvable : ${(n as FrameNode).instanceOf}` }
      case 'source':
        return {
          path: `${p.e.path}.source`,
          message: p.why === 'outside' ? 'source hors d’une instance'
            : p.why === 'unknown' ? `source inconnue dans le composant principal : ${n.source}`
              : `deux calques de la même instance viennent de ${n.source}`,
        }
      case 'cycle':
        return { path: `${p.e.path}.component`, message: `boucle : le composant « ${n.name} » contient une instance de lui-même` }
    }
  })
}

/**
 * Réparation d'un document lu sur disque (objets ordinaires, modifiés en place) : copie marquée
 * principal → plus principal ; instance orpheline → détachée ; instance imbriquée orpheline → copie
 * ordinaire ; `source` hors instance, inconnue ou en double → calque local ; boucle → les instances
 * qui la ferment sont détachées. `warn(chemin, message)` pour chaque réparation.
 */
export function repairComponents(doc: MaquetteDocument, warn: (path: string, message: string) => void): void {
  for (let round = 0; round < 20; round++) {
    const { problems: found, byId } = problems(doc)
    if (!found.length) return
    const lookup = (id: string) => byId.get(id)?.node
    const p = found[0]!
    const n = p.e.node
    switch (p.kind) {
      case 'copy-main':
        delete (n as FrameNode).component
        warn(`${p.e.path}.component`, 'a copy inside an instance cannot be a main component: component removed')
        break
      case 'orphan':
        warn(`${p.e.path}.instanceOf`, `main component ${JSON.stringify((n as FrameNode).instanceOf)} not found: instance detached`)
        detachTree(n as FrameNode, lookup)
        break
      case 'nested-orphan':
        warn(`${p.e.path}.instanceOf`, `main component ${JSON.stringify((n as FrameNode).instanceOf)} not found: link removed`)
        delete (n as FrameNode).instanceOf
        break
      case 'source':
        warn(`${p.e.path}.source`, `${p.why === 'outside' ? 'source outside an instance' : p.why === 'unknown' ? `unknown source ${JSON.stringify(n.source)}` : `duplicated source ${JSON.stringify(n.source)}`}: layer made local`)
        strip(n)
        break
      case 'cycle': {
        // L'instance du principal qui ferme la boucle est détachée (le principal lui-même s'il en est une).
        const env: Pick<SyncEnv, 'locate'> = { locate: (id) => (isMain(byId.get(id)?.node) ? { node: byId.get(id)!.node, parent: null } : null) }
        let culprit: FrameNode | null = null
        const visit = (x: Node) => {
          if (culprit || x.type !== 'frame') return
          if (isInstanceRoot(x) && reaches(env, x.instanceOf!, n.id)) culprit = x
          else x.children.forEach(visit)
        }
        visit(n)
        if (!culprit) {
          // Boucle par une copie imbriquée : son lien est retiré.
          const copy = (function find(x: Node): FrameNode | null {
            if (x.type !== 'frame') return null
            if (x.instanceOf !== undefined && reaches(env, x.instanceOf, n.id)) return x
            for (const c of x.children) {
              const f = find(c)
              if (f) return f
            }
            return null
          })(n)
          if (!copy) return
          delete copy.instanceOf
        } else detachTree(culprit, lookup)
        warn(`${p.e.path}.component`, `main component “${n.name}” contained an instance of itself: instance detached`)
        break
      }
    }
  }
}
