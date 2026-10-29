import { current, enablePatches, isDraft, produceWithPatches, type Patch } from 'immer'
import { normalizeColor, normalizeColorValue } from './color'
import {
  changedProps, clearOverrides, ComponentCycleError, detachTree, enclosingMains, inInstance, instanceMainsIn, instanceOfMain,
  isInstanceRoot, isMain, noteOverrides, plain, propagate, reaches, ROOT_LOCAL_KEYS, snapshotProps, type SyncEnv,
} from './components'
import { autoLayoutDefaults, createNode } from './defaults'
import { alignTextSizing } from './fixes'
import { FALLBACK_ICONS, normalizeIconWeight, resolveIconIn, toIconSet } from './icons/sets'
import { newId } from './ids'
import { isGradient, isImageFill, normalizeFill } from './paint'
import { validateDocument, validateNodes, type Issue } from './rules'
import { containsId, findNodeIn, isFill, isHug, takenIds, walk, type NodeLocation } from './tree'
import { pathBounds } from './vector'
import type { AutoLayout, Axis, Color, FrameNode, IconNode, IconSet, MaquetteDocument, Node, NodeInput, Page, Rect, TextNode, TextStyle } from './types'

enablePatches()

export type Measure = (id: string) => Rect | undefined

export type Op =
  /** `descendants` (avec `instanceOf`) : surcharges des calques de la nouvelle instance, par id du calque du principal. */
  | { op: 'create'; parent: string; index?: number; node: NodeInput & { id?: string; descendants?: Record<string, Record<string, unknown>> } }
  | { op: 'update'; id: string; set: Record<string, unknown> }
  | { op: 'move'; id: string; parent: string; index?: number; x?: number; y?: number }
  | { op: 'delete'; id: string }
  | { op: 'page.create'; id?: string; name: string; index?: number }
  | { op: 'page.update'; id: string; name: string }
  | { op: 'page.delete'; id: string }
  | { op: 'page.move'; id: string; index: number }
  | { op: 'style.color.set'; id?: string; name: string; value: string }
  | ({ op: 'style.text.set'; id?: string } & Omit<TextStyle, 'id'>)
  | { op: 'style.delete'; id: string }

export type ApplyResult =
  | { ok: true; doc: MaquetteDocument; patches: Patch[]; inversePatches: Patch[]; ids: Record<string, string>; fixes: string[] }
  | { ok: false; errors: Issue[] }

class OpError extends Error {
  constructor(public readonly issues: Issue[]) {
    super(issues[0]?.message ?? 'opération refusée')
  }
}

const fail = (i: number, field: string, message: string): never => {
  throw new OpError([{ path: `ops[${i}]${field ? `.${field}` : ''}`, message }])
}

interface Ctx {
  draft: MaquetteDocument
  /** Le document de départ (gelé) : son index sert à retrouver les éléments dans la copie de travail. */
  base: MaquetteDocument
  taken: { has(id: string): boolean; add(id: string): void }
  ids: Record<string, string>
  fixes: string[]
  measure?: Measure
  /** Aperçu : identifiants touchés par l'opération en cours ; `null` = tout le document (page, style). */
  touched: Set<string> | null
  /** Identifiants touchés par l'opération en cours, toujours tenus : les principaux qui les contiennent sont resynchronisés. */
  changed: Set<string>
  /** Instances à remettre d'accord après l'opération en cours (créées, rétablies). */
  dirtyRoots: Set<string>
  /** Instances apparues pendant le lot (créées, promues), par principal : absentes de l'index du document de départ. */
  newRoots: Map<string, Set<string>>
}

/** Identifiants pris : ceux du document de départ (sans copie) plus ceux attribués pendant le lot. */
function takenSet(doc: MaquetteDocument): Ctx['taken'] {
  const base = takenIds(doc)
  const added = new Set<string>()
  return { has: (id) => base.has(id) || added.has(id), add: (id) => void added.add(id) }
}

const locate = (ctx: Ctx, id: string) => findNodeIn(ctx.draft, ctx.base, id)

/** Note les éléments touchés (aperçu : périmètre à valider ; toujours : principaux à resynchroniser). */
function touch(ctx: Ctx, ...ids: (string | null | undefined)[]): void {
  for (const id of ids) {
    if (!id) continue
    ctx.touched?.add(id)
    ctx.changed.add(id)
  }
}

type Container = { kind: 'page'; page: Page } | { kind: 'frame'; node: FrameNode }

const AXES: Axis[] = ['width', 'height']
const LOCKED_KEYS = new Set(['id', 'type', 'children'])
const FONT_KEYS = ['fontFamily', 'fontWeight', 'fontStyle', 'fontSize', 'lineHeight', 'letterSpacing']

/**
 * Applique un lot d'opérations d'un bloc : tout ou rien.
 *
 * `preview` (aperçu d'un geste, à chaque mouvement de souris) : seuls les éléments touchés, leurs
 * parents et leurs enfants directs sont normalisés et validés, au lieu de tout le document. Le
 * document de départ doit être valide. Le résultat est le même qu'en mode complet ; l'appelant
 * valide le document entier une fois le geste terminé (voir `commitGesture`).
 */
export function applyOps(doc: MaquetteDocument, ops: Op[], opts: { measure?: Measure; preview?: boolean } = {}): ApplyResult {
  const ids: Record<string, string> = {}
  const fixes: string[] = []
  try {
    const [next, patches, inversePatches] = produceWithPatches(doc, (draft) => {
      const ctx: Ctx = {
        draft: draft as MaquetteDocument, base: doc, taken: takenSet(doc), ids, fixes, measure: opts.measure, touched: null,
        changed: new Set(), dirtyRoots: new Set(), newRoots: new Map(),
      }
      ops.forEach((op, i) => {
        ctx.touched = opts.preview ? new Set() : null
        ctx.changed = new Set()
        ctx.dirtyRoots = new Set()
        applyOne(ctx, op, i)
        // Dans le même produce : un changement de principal et ses instances = une seule annulation.
        syncComponents(ctx, i)
        const scope = ctx.touched ? scopeOf(ctx, ctx.touched) : null
        if (scope) {
          for (const { node } of scope) normalizeHugFillAt(ctx, node)
          for (const { node, parent } of scope) normalizeContextAt(ctx, node, parent)
        } else {
          normalizeHugFill(ctx)
          normalizeContext(ctx)
        }
        const issues = scope ? validateNodes(ctx.draft, scope) : validateDocument(current(draft) as MaquetteDocument)
        if (issues.length) throw new OpError(issues.map((x) => ({ path: `ops[${i}] → ${x.path}`, message: x.message })))
      })
    })
    return { ok: true, doc: next, patches, inversePatches, ids, fixes }
  } catch (e) {
    if (e instanceof OpError) return { ok: false, errors: e.issues }
    throw e
  }
}

function resolve(ctx: Ctx, ref: string, i: number, field: string): string {
  if (!ref.startsWith('$')) return ref
  return ctx.ids[ref] ?? fail(i, field, `identifiant temporaire inconnu : ${ref}`)
}

/** Remplace les identifiants temporaires des références (`{ style: "$…" }`, `textStyle: "$…"`) par les vrais. */
function resolveRefs<T>(ctx: Ctx, value: T, i: number, field: string): T {
  if (Array.isArray(value)) return value.map((v, k) => resolveRefs(ctx, v, i, `${field}[${k}]`)) as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = (k === 'style' || k === 'textStyle') && typeof v === 'string'
        ? resolve(ctx, v, i, `${field}.${k}`)
        : resolveRefs(ctx, v, i, `${field}.${k}`)
    }
    return out as T
  }
  return value
}

function allocate(ctx: Ctx, requested: string | undefined, i: number, field: string): string {
  if (requested !== undefined && !requested.startsWith('$')) {
    fail(i, field, 'Maquette attribue elle-même les identifiants : utiliser un identifiant temporaire « $… »')
  }
  if (requested !== undefined && ctx.ids[requested]) fail(i, field, `identifiant temporaire déjà utilisé : ${requested}`)
  const id = newId(ctx.taken)
  ctx.taken.add(id)
  if (requested !== undefined) ctx.ids[requested] = id
  return id
}

function container(ctx: Ctx, ref: string, i: number, field: string): Container {
  const id = resolve(ctx, ref, i, field)
  const page = ctx.draft.pages.find((p) => p.id === id)
  if (page) return { kind: 'page', page }
  const loc = locate(ctx, id)
  if (!loc) return fail(i, field, `conteneur introuvable : ${ref}`)
  if (loc.node.type !== 'frame') return fail(i, field, `un élément de type "${loc.node.type}" ne peut pas avoir d’enfants`)
  return { kind: 'frame', node: loc.node }
}

const childrenOf = (c: Container): Node[] => (c.kind === 'page' ? c.page.children : c.node.children)
const isAutoContainer = (c: Container) => c.kind === 'frame' && c.node.layout.mode === 'auto'
const clampIndex = (index: number | undefined, length: number) =>
  index === undefined ? length : Math.max(0, Math.min(index, length))

function toFixed(ctx: Ctx, node: Node, axis: Axis, reason: string): void {
  const size = node[axis]
  if (typeof size === 'number') return
  const value = Math.round(ctx.measure?.(node.id)?.[axis] ?? 100)
  node[axis] = value
  ctx.fixes.push(`${node.name} (${node.id}) : ${axis} passe de "${size.mode}" à ${value} px — ${reason}`)
}

function place(ctx: Ctx, node: Node, x?: number, y?: number): void {
  const r = ctx.measure?.(node.id)
  node.x = Math.round(x ?? node.x ?? r?.x ?? 0)
  node.y = Math.round(y ?? node.y ?? r?.y ?? 0)
}

/** Adapte un élément qui arrive hors du flux d'un cadre automatique. */
function leaveFlow(ctx: Ctx, node: Node, x?: number, y?: number): void {
  for (const axis of AXES) if (isFill(node[axis])) toFixed(ctx, node, axis, '"fill" exige un parent en mise en page automatique')
  delete node.alignSelf
  place(ctx, node, x, y)
}

function applyOne(ctx: Ctx, op: Op, i: number): void {
  // Pages et styles : l'aperçu ne sait pas borner ce qu'ils touchent, tout le document est revu.
  if (op.op.startsWith('page.') || op.op.startsWith('style.')) ctx.touched = null
  switch (op.op) {
    case 'create': {
      const c = container(ctx, op.parent, i, 'parent')
      if ('children' in op.node && op.node.children !== undefined) {
        fail(i, 'node.children', 'créer les enfants avec des opérations "create" séparées (parent: "$…")')
      }
      guardInstance(ctx, c.kind === 'frame' ? c.node.id : null, true, i, 'parent')
      const { id: requested, ...rawInput } = op.node
      const input = resolveRefs(ctx, rawInput, i, 'node') as Record<string, unknown>
      for (const key of ['source', 'overrides']) {
        if (key in input) fail(i, `node.${key}`, `${key} est géré par Maquette (instance : create avec instanceOf, puis update)`)
      }
      if (input.instanceOf !== undefined && input.instanceOf !== null) return createInstance(ctx, c, op.index, requested, input, i)
      delete input.instanceOf
      if ('descendants' in input) fail(i, 'node.descendants', 'descendants n’existe qu’avec instanceOf')
      if (input.component === false || input.component === null) delete input.component
      normalizeColorFields(input, i, 'node')
      if (input.type === 'icon') normalizeIconFields(ctx, input, null)
      if (input.type === 'vector') fitViewBox(input, i, 'node')
      const node = createNode(input as NodeInput, allocate(ctx, requested, i, 'node.id'))
      if (isAutoContainer(c) && node.position === 'flow') ignoreFlowXY(ctx, node)
      else {
        node.x ??= 0
        node.y ??= 0
      }
      if (node.type === 'text' && ('width' in input || 'height' in input) && !('textSizing' in input)) realignText(ctx, node)
      const list = childrenOf(c)
      list.splice(clampIndex(op.index, list.length), 0, node)
      touch(ctx, node.id, c.kind === 'frame' ? c.node.id : null)
      return
    }
    case 'update':
      return updateNode(ctx, resolve(ctx, op.id, i, 'id'), op.set, i, 'set')
    case 'move': {
      const loc = locate(ctx, resolve(ctx, op.id, i, 'id'))
      if (!loc) return fail(i, 'id', `élément introuvable : ${op.id}`)
      const target = container(ctx, op.parent, i, 'parent')
      if (target.kind === 'frame' && containsId(loc.node, target.node.id)) {
        fail(i, 'parent', 'impossible de placer un élément dans lui-même ou dans un de ses descendants')
      }
      guardInstance(ctx, loc.node.id, false, i, 'id')
      guardInstance(ctx, target.kind === 'frame' ? target.node.id : null, true, i, 'parent')
      if (target.kind === 'frame') guardCycle(ctx, instanceMainsIn(plain(loc.node)), target.node.id, i, 'parent')
      // Copie indépendante : current() renvoie l'original (gelé) quand le brouillon n'a pas été modifié,
      // et un élément créé plus tôt dans le lot n'est pas un brouillon du tout.
      const node = structuredClone(isDraft(loc.node) ? current(loc.node) : loc.node) as Node
      if (isAutoContainer(target) && node.position === 'flow') {
        delete node.x
        delete node.y
      } else {
        if (!isAutoContainer(target)) node.position = 'flow'
        leaveFlow(ctx, node, op.x, op.y)
      }
      ;(loc.parent ? loc.parent.children : loc.page.children).splice(loc.index, 1)
      const list = childrenOf(target)
      list.splice(clampIndex(op.index, list.length), 0, node)
      touch(ctx, node.id, loc.parent?.id, target.kind === 'frame' ? target.node.id : null)
      return
    }
    case 'delete': {
      const loc = locate(ctx, resolve(ctx, op.id, i, 'id'))
      if (!loc) return fail(i, 'id', `élément introuvable : ${op.id}`)
      guardInstance(ctx, loc.node.id, false, i, 'id')
      const mains = mainsIn(plain(loc.node))
      ;(loc.parent ? loc.parent.children : loc.page.children).splice(loc.index, 1)
      touch(ctx, loc.parent?.id)
      // Supprimer un principal détache ses instances.
      detachInstancesOf(ctx, mains)
      return
    }
    case 'page.create': {
      const id = allocate(ctx, op.id, i, 'id')
      ctx.draft.pages.splice(clampIndex(op.index, ctx.draft.pages.length), 0, { id, name: op.name, children: [] })
      return
    }
    case 'page.update': {
      const page = ctx.draft.pages.find((p) => p.id === resolve(ctx, op.id, i, 'id'))
      if (!page) return fail(i, 'id', `page introuvable : ${op.id}`)
      page.name = op.name
      return
    }
    case 'page.move': {
      const pages = ctx.draft.pages
      const from = pages.findIndex((p) => p.id === resolve(ctx, op.id, i, 'id'))
      if (from < 0) return fail(i, 'id', `page introuvable : ${op.id}`)
      const [moved] = pages.splice(from, 1)
      // Copie indépendante, comme pour `move` : jamais d'écriture dans un document gelé.
      const page = structuredClone(isDraft(moved) ? current(moved) : moved) as Page
      pages.splice(clampIndex(op.index, pages.length), 0, page)
      return
    }
    case 'page.delete': {
      if (ctx.draft.pages.length <= 1) fail(i, 'id', 'impossible de supprimer la dernière page')
      const index = ctx.draft.pages.findIndex((p) => p.id === resolve(ctx, op.id, i, 'id'))
      if (index < 0) return fail(i, 'id', `page introuvable : ${op.id}`)
      const mains = new Set<string>()
      for (const n of plain(ctx.draft.pages[index]!).children) mainsIn(n, mains)
      ctx.draft.pages.splice(index, 1)
      detachInstancesOf(ctx, mains)
      return
    }
    case 'style.color.set': {
      const value = (typeof op.value === 'string' ? normalizeColor(op.value) : null)
        ?? fail(i, 'value', `couleur illisible : ${JSON.stringify(op.value)}`)
      const existing = findStyle(ctx, ctx.draft.styles.colors, op.id, i)
      if (existing) Object.assign(existing, { name: op.name, value })
      else ctx.draft.styles.colors.push({ id: allocate(ctx, op.id, i, 'id'), name: op.name, value })
      return
    }
    case 'style.text.set': {
      const { op: _op, id, ...props } = op
      const existing = findStyle(ctx, ctx.draft.styles.text, id, i)
      if (existing) Object.assign(existing, props)
      else ctx.draft.styles.text.push({ id: allocate(ctx, id, i, 'id'), ...props })
      return
    }
    case 'style.delete': {
      const id = resolve(ctx, op.id, i, 'id')
      const { colors, text } = ctx.draft.styles
      const ci = colors.findIndex((s) => s.id === id)
      if (ci >= 0) {
        const style = colors[ci]!
        noteDetached(ctx, detachColorStyle(ctx, style.id, style.value), style.name)
        colors.splice(ci, 1)
        return
      }
      const ti = text.findIndex((s) => s.id === id)
      if (ti >= 0) {
        const style = text[ti]!
        noteDetached(ctx, detachTextStyle(ctx, style), style.name)
        text.splice(ti, 1)
        return
      }
      return fail(i, 'id', `style introuvable : ${op.id}`)
    }
    default:
      return fail(i, 'op', `opération inconnue : ${(op as { op: string }).op}`)
  }
}

/**
 * Modifie un élément (`update`, et surcharges d'une instance créée). `field` préfixe les chemins
 * d'erreur (« set », « node.descendants.<id> »). Sur un calque d'instance, chaque propriété changée
 * (y compris par une normalisation) devient une surcharge que la synchronisation ne touche plus.
 */
function updateNode(ctx: Ctx, id: string, rawSet: Record<string, unknown>, i: number, field: string): void {
  const loc = locate(ctx, id)
  if (!loc) return fail(i, field === 'set' ? 'id' : field, `élément introuvable : ${id}`)
  const node = loc.node
  const bag = node as unknown as Record<string, unknown>
  for (const key of Object.keys(rawSet)) {
    if (LOCKED_KEYS.has(key) || key === 'source') fail(i, `${field}.${key}`, `champ non modifiable : ${key}`)
  }
  // resolveRefs reconstruit objets et tableaux : `set` est une copie, jamais partagée avec l'appelant.
  const set = resolveRefs(ctx, rawSet, i, field)
  componentKeys(ctx, loc, set, i, field)
  normalizeColorFields(set, i, field)
  if (node.type === 'icon') normalizeIconFields(ctx, set, node)
  if (node.type === 'vector') fitViewBox(set, i, field)
  // Le calque nommé d'après son icône suit l'icône.
  if (node.type === 'icon' && typeof set.icon === 'string' && !('name' in set) && node.name === node.icon) set.name = set.icon
  const tracked = inInstance(node)
  if (tracked && node.type === 'frame' && 'layout' in set) {
    const mode = (set.layout as { mode?: unknown } | null)?.mode
    if (mode !== node.layout.mode) fail(i, `${field}.layout`, 'la mise en page (auto ou libre) d’un calque d’instance se change dans le composant principal')
  }
  const before = tracked ? snapshotProps(node) : null
  for (const [key, value] of Object.entries(set)) {
    if (key === 'layout') {
      setLayout(ctx, node, value, i)
      continue
    }
    if (value === null) delete bag[key]
    else bag[key] = value
  }
  if (node.type === 'text' && FONT_KEYS.some((k) => k in set) && !('textStyle' in set)) {
    delete node.textStyle
  }
  if (node.type === 'text' && ('width' in set || 'height' in set) && !('textSizing' in set)) realignText(ctx, node)
  if (loc.parent?.layout.mode === 'auto' && node.position === 'flow') ignoreFlowXY(ctx, node)
  // Sorti du flux sans position : il reste là où il était affiché.
  if (loc.parent?.layout.mode === 'auto' && node.position === 'absolute' && (node.x === undefined || node.y === undefined)) {
    leaveFlow(ctx, node)
  }
  if (before) noteOverrides(node, changedProps(before, node))
  touch(ctx, node.id, loc.parent?.id)
}

/**
 * Clés de composant d'un `update`, traitées puis retirées de `set` : `component` (true = devenir
 * principal, false/null = ne plus l'être : ses instances sont détachées), `instanceOf: null`
 * (détacher), `overrides: null` (rétablir le principal).
 */
function componentKeys(ctx: Ctx, loc: NodeLocation, set: Record<string, unknown>, i: number, field: string): void {
  const node = loc.node
  if ('overrides' in set) {
    const v = set.overrides
    delete set.overrides
    if (v !== null && !(Array.isArray(v) && v.length === 0)) {
      fail(i, `${field}.overrides`, 'overrides est tenu par Maquette ; null = rétablir le composant principal')
    }
    if (inInstance(node)) {
      clearOverrides(node)
      const root = isInstanceRoot(node) ? node : ownerRoot(ctx, node.id)
      if (root) ctx.dirtyRoots.add(root.id)
      touch(ctx, node.id)
    }
  }
  if ('component' in set) {
    const v = set.component
    delete set.component
    if (v === true) {
      if (node.type !== 'frame') return fail(i, `${field}.component`, 'seul un cadre peut devenir un composant')
      if (node.source !== undefined) fail(i, `${field}.component`, 'un calque d’instance ne peut pas devenir un composant (détacher l’instance d’abord)')
      node.component = true
    } else if (v === false || v === null) {
      if (node.type === 'frame' && node.component) {
        delete node.component
        detachInstancesOf(ctx, new Set([node.id]))
      }
    } else fail(i, `${field}.component`, 'component vaut true, ou false/null pour ne plus être un composant')
    touch(ctx, node.id)
  }
  if ('instanceOf' in set) {
    const v = set.instanceOf
    delete set.instanceOf
    if (v === null) {
      const nested = node.type === 'frame' && node.instanceOf !== undefined
      if (isInstanceRoot(node)) detachOne(ctx, node)
      else if (nested) {
        fail(i, `${field}.instanceOf`, 'instance imbriquée : détacher l’instance qui la contient')
      }
    } else if (node.type !== 'frame' || v !== node.instanceOf) {
      fail(i, `${field}.instanceOf`, 'instanceOf se donne à la création (create avec instanceOf) ; null = détacher')
    }
  }
}

/** Instance (racine) qui possède le calque `id`, ou null. */
function ownerRoot(ctx: Ctx, id: string): FrameNode | null {
  let loc = locate(ctx, id)
  loc = loc?.parent ? locate(ctx, loc.parent.id) : null
  for (; loc; loc = loc.parent ? locate(ctx, loc.parent.id) : null) {
    if (isInstanceRoot(loc.node)) return loc.node
  }
  return null
}

/** Début du message d'un refus dans une instance (repéré par l'interface pour l'afficher). */
export const INSTANCE_LOCKED = 'est une instance : on ne peut pas y ajouter'

/**
 * Refuse d'ajouter, retirer ou déplacer un calque dans une instance : `id` est le conteneur visé
 * (`self`) ou l'élément dont le parent compte.
 */
function guardInstance(ctx: Ctx, id: string | null, self: boolean, i: number, field: string): void {
  if (!id) return
  let loc = locate(ctx, id)
  if (loc && !self) loc = loc.parent ? locate(ctx, loc.parent.id) : null
  for (; loc; loc = loc.parent ? locate(ctx, loc.parent.id) : null) {
    if (loc.node.type === 'frame' && loc.node.instanceOf !== undefined) {
      fail(i, field, `« ${loc.node.name} » ${INSTANCE_LOCKED}, supprimer ni déplacer de calque (modifier le composant principal, ou détacher l’instance : update {instanceOf:null})`)
    }
  }
}

/** Refuse de poser des instances de `instanceMains` dans `parentId` si l'un de ses principaux en dépend. */
function guardCycle(ctx: Ctx, instanceMains: Set<string>, parentId: string, i: number, field: string): void {
  if (!instanceMains.size) return
  const env = envOf(ctx)
  for (const host of enclosingMains(env, parentId)) {
    for (const m of instanceMains) {
      if (!reaches(env, m, host)) continue
      const name = (id: string) => locate(ctx, id)?.node.name ?? id
      fail(i, field, `boucle : une instance de « ${name(m)} » ne peut pas aller dans « ${name(host)} », qui ${m === host ? 'est ce composant' : 'est utilisé par ce composant'}`)
    }
  }
}

/** Nouvelle instance (`create` avec `instanceOf`), copie complète du principal, puis ses surcharges. */
function createInstance(
  ctx: Ctx, c: Container, index: number | undefined, requested: string | undefined, input: Record<string, unknown>, i: number,
): void {
  const mainId = resolve(ctx, String(input.instanceOf), i, 'node.instanceOf')
  const main = locate(ctx, mainId)?.node
  if (!isMain(main)) return fail(i, 'node.instanceOf', `composant principal introuvable : ${String(input.instanceOf)} (un cadre avec component:true)`)
  if (input.type !== 'frame') fail(i, 'node.type', 'une instance est un cadre (type "frame")')
  if (input.component) fail(i, 'node.component', 'une instance ne peut pas être aussi un composant à sa création')
  if (c.kind === 'frame') guardCycle(ctx, new Set([mainId]), c.node.id, i, 'parent')
  const descendants = input.descendants ?? {}
  const isBag = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  if (!isBag(descendants)) return fail(i, 'node.descendants', 'descendants : {"<id d’un calque du principal>": {propriétés}}')

  const root = instanceOfMain(plain(main), () => allocate(ctx, undefined, i, 'node'))
  root.id = allocate(ctx, requested, i, 'node.id')
  root.position = 'flow'
  for (const key of ['alignSelf', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const) delete root[key]
  const bag = root as unknown as Record<string, unknown>
  const overrides: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (k === 'type' || k === 'instanceOf' || k === 'descendants' || k === 'component') continue
    if (!ROOT_LOCAL_KEYS.has(k)) overrides[k] = v
    else if (v === null) delete bag[k]
    else bag[k] = v
  }
  const flow = isAutoContainer(c) && root.position === 'flow'
  // Taille "fill" du principal hors d'un flux automatique : figée à la taille affichée du principal.
  for (const axis of AXES) {
    if (isFill(root[axis]) && !flow && !(axis in input)) root[axis] = Math.round(ctx.measure?.(mainId)?.[axis] ?? 100)
  }
  if (flow) {
    if ('x' in input || 'y' in input) ignoreFlowXY(ctx, root)
    delete root.x
    delete root.y
  } else {
    root.x = typeof input.x === 'number' ? input.x : 0
    root.y = typeof input.y === 'number' ? input.y : 0
  }
  const list = childrenOf(c)
  list.splice(clampIndex(index, list.length), 0, root)
  addNewRoot(ctx, mainId, root.id)
  touch(ctx, root.id, c.kind === 'frame' ? c.node.id : null)
  if (Object.keys(overrides).length) updateNode(ctx, root.id, overrides, i, 'node')
  for (const [key, props] of Object.entries(descendants)) {
    const path = `node.descendants.${key}`
    if (!isBag(props)) fail(i, path, 'propriétés attendues : {"content": "…"}')
    const sourceId = resolve(ctx, key, i, path)
    const target = findBySource(root, sourceId)
    if (!target) fail(i, path, `aucun calque de l’instance ne vient de ${key} (id d’un calque du composant principal)`)
    updateNode(ctx, target!.id, props as Record<string, unknown>, i, path)
  }
}

/** Calque copié de `sourceId` dans une instance (sans entrer dans les instances indépendantes). */
function findBySource(root: Node, sourceId: string): Node | null {
  if (root.type !== 'frame') return null
  for (const c of root.children) {
    if (c.source === undefined) continue
    if (c.source === sourceId) return c
    const found = findBySource(c, sourceId)
    if (found) return found
  }
  return null
}

/** Principaux d'un sous-arbre (lui compris). */
function mainsIn(node: Node, into = new Set<string>()): Set<string> {
  if (isMain(node)) into.add(node.id)
  if (node.type === 'frame') for (const c of node.children) mainsIn(c, into)
  return into
}

function addNewRoot(ctx: Ctx, mainId: string, id: string): void {
  const set = ctx.newRoots.get(mainId) ?? new Set<string>()
  set.add(id)
  ctx.newRoots.set(mainId, set)
}

/** Détache une instance (racine) ; ses instances imbriquées deviennent des instances indépendantes. */
function detachOne(ctx: Ctx, root: FrameNode): void {
  const lookup = (id: string) => {
    const l = locate(ctx, id)
    return l ? plain(l.node) : undefined
  }
  for (const k of detachTree(root, lookup)) addNewRoot(ctx, k.instanceOf!, k.id)
  touch(ctx, root.id)
}

/** Détache les instances de principaux supprimés (ou qui ne le sont plus). */
function detachInstancesOf(ctx: Ctx, mains: Set<string>): void {
  if (!mains.size) return
  const env = envOf(ctx)
  for (const m of mains) {
    for (const r of env.rootsOf(m)) {
      const node = locate(ctx, r)?.node
      if (isInstanceRoot(node) && node.instanceOf === m) detachOne(ctx, node)
    }
  }
}

/** Racines d'instances par principal, d'un document gelé (indexé une fois) ou non. */
const rootIndexes = new WeakMap<MaquetteDocument, Map<string, string[]>>()

function rootIndex(doc: MaquetteDocument): Map<string, string[]> {
  const frozen = Object.isFrozen(doc)
  let index = frozen ? rootIndexes.get(doc) : undefined
  if (!index) {
    const out = new Map<string, string[]>()
    walk(doc, ({ node }) => {
      if (isInstanceRoot(node)) out.set(node.instanceOf!, [...(out.get(node.instanceOf!) ?? []), node.id])
    })
    index = out
    if (frozen) rootIndexes.set(doc, index)
  }
  return index
}

function envOf(ctx: Ctx): SyncEnv {
  return {
    locate: (id) => locate(ctx, id),
    rootsOf: (m) => [...(rootIndex(ctx.base).get(m) ?? []), ...(ctx.newRoots.get(m) ?? [])],
    newId: () => {
      const id = newId(ctx.taken)
      ctx.taken.add(id)
      return id
    },
  }
}

/**
 * Après chaque opération : les principaux qui contiennent un élément touché voient leurs instances
 * remises d'accord (en cascade), ainsi que les instances marquées (rétablies).
 */
function syncComponents(ctx: Ctx, i: number): void {
  if (!ctx.changed.size && !ctx.dirtyRoots.size) return
  const env = envOf(ctx)
  const mains = new Set<string>()
  for (const id of ctx.changed) for (const m of enclosingMains(env, id)) mains.add(m)
  if (!mains.size && !ctx.dirtyRoots.size) return
  try {
    propagate(env, mains, ctx.dirtyRoots)
  } catch (e) {
    if (e instanceof ComponentCycleError) fail(i, '', e.message)
    throw e
  }
}

/** Style existant visé par `id` (réel ou temporaire déjà attribué), ou undefined s'il faut le créer. */
function findStyle<T extends { id: string }>(ctx: Ctx, list: T[], id: string | undefined, i: number): T | undefined {
  if (id === undefined) return undefined
  if (id.startsWith('$')) {
    const real = ctx.ids[id]
    return real ? list.find((s) => s.id === real) : undefined
  }
  return list.find((s) => s.id === id) ?? fail(i, 'id', `style introuvable : ${id}`)
}

function setLayout(ctx: Ctx, node: Node, value: unknown, i: number): void {
  if (node.type !== 'frame') return fail(i, 'set.layout', 'seul un cadre a une mise en page')
  const next = value as ({ mode?: string } & Record<string, unknown>) | null
  if (next?.mode === 'free') {
    if (node.layout.mode === 'auto') {
      for (const child of node.children) {
        if (child.position === 'flow') leaveFlow(ctx, child)
        else child.position = 'flow'
      }
      for (const axis of AXES) if (isHug(node[axis])) toFixed(ctx, node, axis, 'un cadre libre ne peut pas s’adapter à son contenu')
    }
    node.layout = { mode: 'free' }
    return
  }
  if (next?.mode === 'auto') {
    const wasFree = node.layout.mode === 'free'
    const base = node.layout.mode === 'auto' ? node.layout : autoLayoutDefaults()
    node.layout = { ...base, ...structuredClone(next), mode: 'auto' } as AutoLayout
    if (wasFree) {
      for (const child of node.children) {
        delete child.x
        delete child.y
      }
    }
    return
  }
  fail(i, 'set.layout', 'layout.mode doit valoir "free" ou "auto"')
}

const MIN_MAX = ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const

/**
 * Retire ce qu'un changement de contexte a rendu sans objet (règles 5 et 7, alignSelf),
 * au lieu de refuser : bornes hors cadre automatique, alignSelf hors flux, rowGap sans retour
 * à la ligne, baseline hors ligne. Chaque retrait est noté dans `fixes`.
 */
function normalizeContext(ctx: Ctx): void {
  walk(ctx.draft, ({ node, parent }) => normalizeContextAt(ctx, node, parent))
}

function normalizeContextAt(ctx: Ctx, node: Node, parent: FrameNode | null): void {
  const note = (node: Node, what: string) => ctx.fixes.push(`${node.name} (${node.id}) : ${what}`)
  const autoParent = parent?.layout.mode === 'auto'
  const autoSelf = node.type === 'frame' && node.layout.mode === 'auto'
  if (!autoParent && !autoSelf) {
    for (const key of MIN_MAX) {
      if (node[key] !== undefined) {
        delete node[key]
        note(node, `${key} retiré, il ne s’applique qu’en mise en page automatique`)
      }
    }
  }
  if (node.alignSelf !== undefined && !(autoParent && node.position === 'flow')) {
    delete node.alignSelf
    note(node, 'alignSelf retiré, il ne s’applique qu’à un enfant en flux')
  }
  if (node.type === 'frame' && node.layout.mode === 'auto') {
    const layout = node.layout
    if (layout.rowGap !== undefined && !layout.wrap) {
      delete layout.rowGap
      note(node, 'rowGap retiré, il ne s’applique qu’avec le retour à la ligne')
    }
    if (layout.align === 'baseline' && layout.direction !== 'row') {
      layout.align = 'start'
      note(node, 'alignement "baseline" ramené à "start", il n’existe qu’en ligne')
    }
  }
}

/**
 * Aperçu : éléments à normaliser et valider après une opération — ceux touchés, leurs parents et
 * leurs enfants directs (le contexte d'un enfant dépend de son parent). Le reste est inchangé.
 */
function scopeOf(ctx: Ctx, touched: Set<string>): NodeLocation[] {
  const out = new Map<string, NodeLocation>()
  for (const id of touched) {
    const loc = locate(ctx, id)
    if (!loc) continue
    out.set(id, loc)
    if (loc.parent && !out.has(loc.parent.id)) {
      const up = locate(ctx, loc.parent.id)
      if (up) out.set(up.node.id, up)
    }
    if (loc.node.type === 'frame') {
      const frame = loc.node
      frame.children.forEach((node, index) => {
        if (!out.has(node.id)) out.set(node.id, { node, parent: frame, page: loc.page, index, path: `${loc.path}.children[${index}]` })
      })
    }
  }
  return [...out.values()]
}

/** Règle 3 : un cadre "hug" dont un enfant en flux est "fill" sur le même axe passe en fixe. */
function normalizeHugFill(ctx: Ctx): void {
  walk(ctx.draft, ({ node }) => normalizeHugFillAt(ctx, node))
}

function normalizeHugFillAt(ctx: Ctx, node: Node): void {
  if (node.type !== 'frame' || node.layout.mode !== 'auto') return
  for (const axis of AXES) {
    if (isHug(node[axis]) && node.children.some((c) => c.position === 'flow' && isFill(c[axis]))) {
      toFixed(ctx, node, axis, 'un enfant est en "fill" sur cet axe')
    }
  }
}

/** Convertit les couleurs CSS lisibles d'une saisie (fills, stroke.color, shadows[].color, color) ; refuse les illisibles. */
function normalizeColorFields(bag: Record<string, unknown>, i: number, prefix: string): void {
  const norm = (c: unknown, path: string): Color =>
    normalizeColorValue(c) ?? fail(i, path, `couleur illisible : ${JSON.stringify(c)}`)
  const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
  if (Array.isArray(bag.fills)) {
    bag.fills = bag.fills.map((f, k) => normalizeFill(f) ?? fail(i, `${prefix}.fills[${k}]`, `remplissage illisible : ${JSON.stringify(f)}`))
  }
  if (isObj(bag.stroke) && 'color' in bag.stroke) bag.stroke.color = norm(bag.stroke.color, `${prefix}.stroke.color`)
  if (Array.isArray(bag.shadows)) {
    bag.shadows.forEach((sh, k) => {
      if (isObj(sh) && 'color' in sh) sh.color = norm(sh.color, `${prefix}.shadows[${k}].color`)
    })
  }
  if (bag.color !== undefined && bag.color !== null) bag.color = norm(bag.color, `${prefix}.color`)
}

/**
 * Icône créée (`current` null) ou modifiée : jeu nommé librement → jeu du modèle (inconnu → Lucide),
 * nom écrit autrement ou ancien → nom du jeu, inconnu → icône de repli (jamais de refus), variante
 * ramenée au jeu (convertie quand le jeu change, retirée s'il n'en a pas). Pour une modification,
 * une clé à `null` retire la propriété.
 */
function normalizeIconFields(ctx: Ctx, bag: Record<string, unknown>, current: IconNode | null): void {
  const drop = (key: string) => {
    if (current) bag[key] = null
    else delete bag[key]
  }
  let set: IconSet = current?.set ?? 'lucide'
  const changed = 'set' in bag && bag.set !== undefined
  if (changed) {
    const to = bag.set === null ? 'lucide' : toIconSet(bag.set)
    if (!to) ctx.fixes.push(`jeu d’icônes inconnu « ${String(bag.set)} » : lucide (jeux : lucide, phosphor, feather, material-rounded)`)
    set = to ?? 'lucide'
    bag.set = set
  }
  const switched = changed && current !== null && set !== current.set
  const name = typeof bag.icon === 'string' ? bag.icon : switched ? current.icon : undefined
  if (name !== undefined) {
    const resolved = resolveIconIn(set, name)
    if (resolved !== name) {
      if (!resolved) ctx.fixes.push(`icône inconnue « ${name} » dans ${set} : remplacée par ${FALLBACK_ICONS[set]} (chercher le bon nom avec l’outil icones)`)
      bag.icon = resolved ?? FALLBACK_ICONS[set]
    } else if (switched) bag.icon = name
  }
  const weight = 'weight' in bag ? bag.weight : switched ? current.weight : undefined
  if (weight !== undefined && weight !== null) {
    const w = normalizeIconWeight(set, weight)
    if (w === undefined) {
      if ('weight' in bag) ctx.fixes.push(`weight « ${String(weight)} » ignoré pour ${set}`)
      drop('weight')
    } else bag.weight = w
  }
  if (set !== 'material-rounded' && (bag.filled !== undefined || (switched && current.filled !== undefined))) {
    if (bag.filled) ctx.fixes.push(`filled ignoré pour ${set} (Material seulement)`)
    drop('filled')
  }
}

/** Vecteur : un tracé donné sans `viewBox` prend sa boîte englobante (la taille par défaut en découle). */
function fitViewBox(bag: Record<string, unknown>, i: number, prefix: string): void {
  if (typeof bag.path !== 'string' || bag.viewBox !== undefined) return
  bag.viewBox = pathBounds(bag.path) ?? fail(i, `${prefix}.path`, `tracé SVG illisible : ${JSON.stringify(bag.path.slice(0, 80))}`)
}

/** §6.1 : un enfant en flux d'un cadre automatique n'a pas de x/y ; ils sont retirés, pas refusés. */
function ignoreFlowXY(ctx: Ctx, node: Node): void {
  if (node.x === undefined && node.y === undefined) return
  delete node.x
  delete node.y
  ctx.fixes.push(`${node.name} (${node.id}) : x/y ignorés, la position est calculée par la mise en page automatique`)
}

/** §6.1 : changer la taille d'un texte sans préciser textSizing réaligne textSizing. */
function realignText(ctx: Ctx, node: TextNode): void {
  if (alignTextSizing(node)) ctx.fixes.push(`${node.name} (${node.id}) : textSizing passe à "${node.textSizing}"`)
}

function noteDetached(ctx: Ctx, count: number, name: string): void {
  if (count > 0) ctx.fixes.push(`${count} élément(s) détaché(s) du style « ${name} »`)
}

/** Remplace chaque `{ style: id }` par la valeur de la couleur ; renvoie le nombre d'éléments touchés. */
function detachColorStyle(ctx: Ctx, id: string, value: string): number {
  let count = 0
  walk(ctx.draft, ({ node }) => {
    let touched = false
    const fix = (c: Color): Color => {
      if (typeof c !== 'object' || c.style !== id) return c
      touched = true
      return value
    }
    // Affectations élément par élément : une valeur inchangée ne produit aucun patch.
    if ('fills' in node) {
      node.fills.forEach((f, k) => {
        if (isImageFill(f)) return
        if (isGradient(f)) f.stops.forEach((st) => { st.color = fix(st.color) })
        else node.fills[k] = fix(f)
      })
    }
    if ('stroke' in node && node.stroke) node.stroke.color = fix(node.stroke.color)
    if ('shadows' in node) node.shadows.forEach((sh) => { sh.color = fix(sh.color) })
    if (node.type === 'text' || node.type === 'icon') node.color = fix(node.color)
    if (touched) count++
  })
  return count
}

/** Recopie les propriétés de police du style dans chaque texte qui le référence, puis retire la référence. */
function detachTextStyle(ctx: Ctx, style: TextStyle): number {
  let count = 0
  const { id, name: _name, ...font } = style
  walk(ctx.draft, ({ node }) => {
    if (node.type !== 'text' || node.textStyle !== id) return
    Object.assign(node, font)
    delete node.textStyle
    count++
  })
  return count
}
