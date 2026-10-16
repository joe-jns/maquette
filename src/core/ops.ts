import { current, enablePatches, isDraft, produceWithPatches, type Patch } from 'immer'
import { autoLayoutDefaults, createNode } from './defaults'
import { newId } from './ids'
import { validateDocument, type Issue } from './rules'
import { collectIds, containsId, findNode, isFill, isHug, walk } from './tree'
import type { AutoLayout, Axis, FrameNode, MaquetteDocument, Node, NodeInput, Page, Rect, TextNode, TextStyle } from './types'

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
  taken: Set<string>
  ids: Record<string, string>
  fixes: string[]
  measure?: Measure
}

type Container = { kind: 'page'; page: Page } | { kind: 'frame'; node: FrameNode }

const AXES: Axis[] = ['width', 'height']
const LOCKED_KEYS = new Set(['id', 'type', 'children'])
const FONT_KEYS = ['fontFamily', 'fontWeight', 'fontStyle', 'fontSize', 'lineHeight', 'letterSpacing']

/** Applique un lot d'opérations d'un bloc : tout ou rien. */
export function applyOps(doc: MaquetteDocument, ops: Op[], opts: { measure?: Measure } = {}): ApplyResult {
  const ids: Record<string, string> = {}
  const fixes: string[] = []
  try {
    const [next, patches, inversePatches] = produceWithPatches(doc, (draft) => {
      const ctx: Ctx = { draft: draft as MaquetteDocument, taken: collectIds(draft as MaquetteDocument), ids, fixes, measure: opts.measure }
      ops.forEach((op, i) => {
        applyOne(ctx, op, i)
        normalizeHugFill(ctx)
        const issues = validateDocument(current(draft) as MaquetteDocument)
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
  const loc = findNode(ctx.draft, id)
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
  switch (op.op) {
    case 'create': {
      const c = container(ctx, op.parent, i, 'parent')
      if ('children' in op.node && op.node.children !== undefined) {
        fail(i, 'node.children', 'créer les enfants avec des opérations "create" séparées (parent: "$…")')
      }
      const { id: requested, ...input } = op.node
      const node = createNode(resolveRefs(ctx, input, i, 'node') as NodeInput, allocate(ctx, requested, i, 'node.id'))
      if (!(isAutoContainer(c) && node.position === 'flow')) {
        node.x ??= 0
        node.y ??= 0
      }
      const list = childrenOf(c)
      list.splice(clampIndex(op.index, list.length), 0, node)
      return
    }
    case 'update': {
      const loc = findNode(ctx.draft, resolve(ctx, op.id, i, 'id'))
      if (!loc) return fail(i, 'id', `élément introuvable : ${op.id}`)
      const node = loc.node
      const bag = node as unknown as Record<string, unknown>
      for (const [key, value] of Object.entries(op.set)) {
        if (LOCKED_KEYS.has(key)) fail(i, `set.${key}`, `champ non modifiable : ${key}`)
        if (key === 'layout') {
          setLayout(ctx, node, value, i)
          continue
        }
        if (value === null) delete bag[key]
        else if (key === 'textStyle' && typeof value === 'string') bag[key] = resolve(ctx, value, i, 'set.textStyle')
        else bag[key] = structuredClone(resolveRefs(ctx, value, i, `set.${key}`))
      }
      if (node.type === 'text' && FONT_KEYS.some((k) => k in op.set) && !('textStyle' in op.set)) {
        delete (node as TextNode).textStyle
      }
      return
    }
    case 'move': {
      const loc = findNode(ctx.draft, resolve(ctx, op.id, i, 'id'))
      if (!loc) return fail(i, 'id', `élément introuvable : ${op.id}`)
      const target = container(ctx, op.parent, i, 'parent')
      if (target.kind === 'frame' && containsId(loc.node, target.node.id)) {
        fail(i, 'parent', 'impossible de placer un élément dans lui-même ou dans un de ses descendants')
      }
      // Un élément créé plus tôt dans le même lot n'est pas un brouillon Immer : current() le refuserait.
      const node = (isDraft(loc.node) ? current(loc.node) : loc.node) as Node
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
      return
    }
    case 'delete': {
      const loc = findNode(ctx.draft, resolve(ctx, op.id, i, 'id'))
      if (!loc) return fail(i, 'id', `élément introuvable : ${op.id}`)
      ;(loc.parent ? loc.parent.children : loc.page.children).splice(loc.index, 1)
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
    case 'page.delete': {
      if (ctx.draft.pages.length <= 1) fail(i, 'id', 'impossible de supprimer la dernière page')
      const index = ctx.draft.pages.findIndex((p) => p.id === resolve(ctx, op.id, i, 'id'))
      if (index < 0) return fail(i, 'id', `page introuvable : ${op.id}`)
      ctx.draft.pages.splice(index, 1)
      return
    }
    case 'style.color.set': {
      const existing = findStyle(ctx, ctx.draft.styles.colors, op.id, i)
      if (existing) Object.assign(existing, { name: op.name, value: op.value })
      else ctx.draft.styles.colors.push({ id: allocate(ctx, op.id, i, 'id'), name: op.name, value: op.value })
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
      for (const list of [ctx.draft.styles.colors, ctx.draft.styles.text] as { id: string }[][]) {
        const index = list.findIndex((s) => s.id === id)
        if (index >= 0) {
          list.splice(index, 1)
          return
        }
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

/** Règle 3 : un cadre "hug" dont un enfant en flux est "fill" sur le même axe passe en fixe. */
function normalizeHugFill(ctx: Ctx): void {
  walk(ctx.draft, ({ node }) => {
    if (node.type !== 'frame' || node.layout.mode !== 'auto') return
    for (const axis of AXES) {
      if (isHug(node[axis]) && node.children.some((c) => c.position === 'flow' && isFill(c[axis]))) {
        toFixed(ctx, node, axis, 'un enfant est en "fill" sur cet axe')
      }
    }
  })
}
