import { current, enablePatches, isDraft, produceWithPatches, type Patch } from 'immer'
import { normalizeColor, normalizeColorValue } from './color'
import { autoLayoutDefaults, createNode } from './defaults'
import { alignTextSizing } from './fixes'
import { FALLBACK_ICON, resolveIcon } from './icons/lucide'
import { newId } from './ids'
import { isGradient, isImageFill, normalizeFill } from './paint'
import { validateDocument, validateNodes, type Issue } from './rules'
import { containsId, findNodeIn, isFill, isHug, takenIds, walk, type NodeLocation } from './tree'
import { pathBounds } from './vector'
import type { AutoLayout, Axis, Color, FrameNode, MaquetteDocument, Node, NodeInput, Page, Rect, TextNode, TextStyle } from './types'

enablePatches()

export type Measure = (id: string) => Rect | undefined

export type Op =
  | { op: 'create'; parent: string; index?: number; node: NodeInput & { id?: string } }
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
}

/** Identifiants pris : ceux du document de départ (sans copie) plus ceux attribués pendant le lot. */
function takenSet(doc: MaquetteDocument): Ctx['taken'] {
  const base = takenIds(doc)
  const added = new Set<string>()
  return { has: (id) => base.has(id) || added.has(id), add: (id) => void added.add(id) }
}

const locate = (ctx: Ctx, id: string) => findNodeIn(ctx.draft, ctx.base, id)

/** Aperçu : note les éléments touchés (rien à faire en mode complet). */
function touch(ctx: Ctx, ...ids: (string | null | undefined)[]): void {
  for (const id of ids) if (id) ctx.touched?.add(id)
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
      const ctx: Ctx = { draft: draft as MaquetteDocument, base: doc, taken: takenSet(doc), ids, fixes, measure: opts.measure, touched: null }
      ops.forEach((op, i) => {
        ctx.touched = opts.preview ? new Set() : null
        applyOne(ctx, op, i)
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
      const { id: requested, ...rawInput } = op.node
      const input = resolveRefs(ctx, rawInput, i, 'node') as Record<string, unknown>
      normalizeColorFields(input, i, 'node')
      normalizeIconField(ctx, input)
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
    case 'update': {
      const loc = locate(ctx, resolve(ctx, op.id, i, 'id'))
      if (!loc) return fail(i, 'id', `élément introuvable : ${op.id}`)
      const node = loc.node
      const bag = node as unknown as Record<string, unknown>
      for (const key of Object.keys(op.set)) {
        if (LOCKED_KEYS.has(key)) fail(i, `set.${key}`, `champ non modifiable : ${key}`)
      }
      // resolveRefs reconstruit objets et tableaux : `set` est une copie, jamais partagée avec l'appelant.
      const set = resolveRefs(ctx, op.set, i, 'set')
      normalizeColorFields(set, i, 'set')
      normalizeIconField(ctx, set)
      if (node.type === 'vector') fitViewBox(set, i, 'set')
      // Le calque nommé d'après son icône suit l'icône.
      if (node.type === 'icon' && typeof set.icon === 'string' && !('name' in set) && node.name === node.icon) set.name = set.icon
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
      touch(ctx, node.id, loc.parent?.id)
      return
    }
    case 'move': {
      const loc = locate(ctx, resolve(ctx, op.id, i, 'id'))
      if (!loc) return fail(i, 'id', `élément introuvable : ${op.id}`)
      const target = container(ctx, op.parent, i, 'parent')
      if (target.kind === 'frame' && containsId(loc.node, target.node.id)) {
        fail(i, 'parent', 'impossible de placer un élément dans lui-même ou dans un de ses descendants')
      }
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
      ;(loc.parent ? loc.parent.children : loc.page.children).splice(loc.index, 1)
      touch(ctx, loc.parent?.id)
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
      ctx.draft.pages.splice(index, 1)
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

/** Nom d'icône écrit autrement ou ancien nom → nom du jeu ; inconnu → icône de repli (jamais de refus). */
function normalizeIconField(ctx: Ctx, bag: Record<string, unknown>): void {
  if (typeof bag.icon !== 'string') return
  const resolved = resolveIcon(bag.icon)
  if (resolved === bag.icon) return
  if (resolved) {
    bag.icon = resolved
    return
  }
  ctx.fixes.push(`icône inconnue « ${bag.icon} » : remplacée par ${FALLBACK_ICON} (chercher le bon nom avec l’outil icones)`)
  bag.icon = FALLBACK_ICON
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
