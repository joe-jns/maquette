/**
 * Normalisation des opérations de l'outil `appliquer`, AVANT validation : les formes que les modèles
 * écrivent naturellement (noms CSS ou Figma, peintures objet, enfants imbriqués) sont ramenées à la
 * forme de Maquette quand l'intention est claire. Ce qui reste ambigu est laissé tel quel, la
 * validation le refusera avec un indice. Code pur : l'entrée n'est jamais modifiée.
 */
import { normalizeColor } from '../core/color'

type Obj = Record<string, unknown>
type NodeKind = 'frame' | 'text' | 'shape' | 'image' | 'icon' | undefined

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isPx = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// ——— Peintures ———

const PAINT_KEYS = new Set(['type', 'color', 'opacity'])

/**
 * Peinture unie sous forme d'objet → chaîne de couleur : {type:"solid",color}, {color,opacity?}.
 * L'opacité multiplie l'alpha. Tout autre objet (dégradé, style nommé…) est rendu tel quel.
 */
export function paint(v: unknown): unknown {
  if (!isObj(v) || typeof v.color !== 'string') return v
  if (Object.keys(v).some((k) => !PAINT_KEYS.has(k))) return v
  if (v.type !== undefined && (typeof v.type !== 'string' || v.type.toLowerCase() !== 'solid')) return v
  const hex = normalizeColor(v.color)
  if (!hex) return v
  if (v.opacity === undefined) return hex
  if (!isPx(v.opacity) || v.opacity < 0 || v.opacity > 1) return v
  const alpha = (hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1) * v.opacity
  const out = hex.slice(0, 7) + (alpha >= 1 ? '' : Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase())
  return out
}

// ——— Clés alias ———

const TEXT_ALIGNS = new Set(['left', 'center', 'right', 'justify'])
const asList = (v: unknown) => (Array.isArray(v) ? v : [v])

function padding(v: unknown): unknown {
  if (isPx(v)) return [v, v, v, v]
  if (!Array.isArray(v) || !v.every(isPx)) return undefined
  if (v.length === 1) return [v[0], v[0], v[0], v[0]]
  if (v.length === 2) return [v[0], v[1], v[0], v[1]]
  if (v.length === 3) return [v[0], v[1], v[2], v[1]]
  return v.length === 4 ? v : undefined
}

/** Trait : défauts pour ce qui manque quand la couleur est donnée ; « 1px solid #ddd » lu. */
function stroke(v: unknown): unknown {
  if (Array.isArray(v)) return v.length === 1 ? stroke(v[0]) : undefined
  if (typeof v === 'string') {
    const m = /^\s*(\d+(?:\.\d+)?)(?:px)?\s+solid\s+(.+?)\s*$/i.exec(v)
    return m ? { color: m[2], width: Number(m[1]), align: 'inside' } : undefined
  }
  if (!isObj(v) || v.color === undefined) return isObj(v) ? v : undefined
  const solid = paint(v)
  if (typeof solid === 'string') return { color: solid, width: 1, align: 'inside' }
  return { width: 1, align: 'inside', ...v }
}

/** Ombre : x, y, flou, étalement à 0 et inset à false quand ils manquent. */
function shadow(v: unknown): unknown {
  if (!isObj(v) || v.color === undefined) return v
  return { x: 0, y: 0, blur: 0, spread: 0, inset: false, ...v }
}

function layoutFrom(key: string, v: unknown): Obj | undefined {
  if (key === 'layoutMode') {
    const s = typeof v === 'string' ? v.toLowerCase() : ''
    if (s === 'horizontal' || s === 'row') return { mode: 'auto', direction: 'row' }
    if (s === 'vertical' || s === 'column') return { mode: 'auto', direction: 'column' }
    if (s === 'none' || s === 'free') return { mode: 'free' }
    return undefined
  }
  if (v === true) return { mode: 'auto' }
  if (v === false) return { mode: 'free' }
  return isObj(v) ? { mode: 'auto', ...v } : undefined
}

interface Alias {
  target: string
  /** Valeur convertie pour la cible, ou undefined si la forme n'est pas reconnue (erreur comme avant). */
  convert: (v: unknown, kind: NodeKind) => unknown
}

const keep = (v: unknown) => v
const radius = (v: unknown) => (isPx(v) || (Array.isArray(v) && v.length === 4 && v.every(isPx)) ? v : undefined)
const fills: Alias = { target: 'fills', convert: (v) => asList(v) }
const shadows: Alias = { target: 'shadows', convert: (v) => (typeof v === 'string' ? undefined : asList(v)) }
const content: Alias = { target: 'content', convert: (v, k) => (typeof v === 'string' && (k === 'text' || k === undefined) ? v : undefined) }
const boolean = (target: string, invert = false): Alias => ({
  target, convert: (v) => (typeof v === 'boolean' ? v !== invert : undefined),
})

const ALIAS_RULES: Record<string, Alias> = {
  cornerRadius: { target: 'radius', convert: radius },
  borderRadius: { target: 'radius', convert: radius },
  strokes: { target: 'stroke', convert: stroke },
  border: { target: 'stroke', convert: stroke },
  fill: fills,
  background: fills,
  backgroundColor: fills,
  effects: shadows,
  shadow: shadows,
  boxShadow: shadows,
  text: content,
  characters: content,
  fontColor: { target: 'color', convert: keep },
  textColor: { target: 'color', convert: keep },
  align: { target: 'textAlign', convert: (v, k) => (k === 'text' && typeof v === 'string' && TEXT_ALIGNS.has(v) ? v : undefined) },
  autoLayout: { target: 'layout', convert: (v) => layoutFrom('autoLayout', v) },
  layoutMode: { target: 'layout', convert: (v) => layoutFrom('layoutMode', v) },
  itemSpacing: { target: 'layout.gap', convert: (v) => (isPx(v) || v === 'auto' ? v : undefined) },
  gap: { target: 'layout.gap', convert: (v) => (isPx(v) || v === 'auto' ? v : undefined) },
  padding: { target: 'layout.padding', convert: padding },
  w: { target: 'width', convert: keep },
  h: { target: 'height', convert: keep },
  hidden: boolean('visible', true),
  clipsContent: boolean('clip'),
  overflow: { target: 'clip', convert: (v) => (v === 'hidden' ? true : v === 'visible' ? false : undefined) },
}

/** Noms devinés (CSS, Figma) → nom de Maquette, pour l'indice des messages d'erreur. */
export const ALIASES: Record<string, string> = Object.fromEntries(Object.entries(ALIAS_RULES).map(([k, a]) => [k, a.target]))

const LAYOUT_KEYS = new Set(['mode', 'direction', 'gap', 'padding', 'justify', 'align', 'wrap', 'rowGap', 'reverseZ'])

/**
 * Normalise une saisie d'élément (node d'un create, set d'un update) en place. `kind` est le type
 * de l'élément quand il est connu. Renvoie les formes adaptées (« fill→fills »…).
 */
function normalizeBag(bag: Obj, kind: NodeKind): string[] {
  const notes: string[] = []

  // Texte : chez Figma, la couleur d'un texte est sa peinture.
  if (kind === 'text') {
    for (const key of ['fill', 'fills']) {
      const v = bag[key]
      const list = asList(v)
      if (v === undefined || bag.color !== undefined || list.length !== 1) continue
      bag.color = list[0]
      delete bag[key]
      notes.push(`${key}→color`)
    }
  }

  // Une mise en page sans mode mais avec des réglages automatiques est automatique.
  if (isObj(bag.layout) && bag.layout.mode === undefined && Object.keys(bag.layout).some((k) => LAYOUT_KEYS.has(k))) {
    bag.layout = { mode: 'auto', ...bag.layout }
    notes.push('layout.mode→auto')
  }

  for (const [key, rule] of Object.entries(ALIAS_RULES)) {
    if (bag[key] === undefined) continue
    const value = rule.convert(bag[key], kind)
    if (value === undefined) continue
    if (rule.target.startsWith('layout.')) {
      if (kind !== undefined && kind !== 'frame') continue
      const sub = rule.target.slice('layout.'.length)
      const layout = bag.layout
      if (layout !== undefined && !(isObj(layout) && layout.mode === 'auto')) continue
      const current = isObj(layout) ? layout : { mode: 'auto' }
      if (current[sub] !== undefined && !same(current[sub], value)) continue
      bag.layout = { ...current, [sub]: value }
    } else if (rule.target === 'layout' && isObj(bag.layout)) {
      const layout = bag.layout
      const derived = value as Obj
      if (Object.entries(derived).some(([k, v]) => layout[k] !== undefined && !same(layout[k], v))) continue
      bag.layout = { ...derived, ...layout }
    } else if (bag[rule.target] !== undefined) {
      if (!same(bag[rule.target], value)) continue
    } else {
      bag[rule.target] = value
    }
    delete bag[key]
    notes.push(`${key}→${rule.target}`)
  }

  // Formes de valeurs (sous la bonne clé)
  if (bag.padding === undefined && isObj(bag.layout) && bag.layout.padding !== undefined) {
    const p = padding(bag.layout.padding)
    if (p !== undefined && !same(p, bag.layout.padding)) bag.layout = { ...bag.layout, padding: p }
  }
  if (bag.fills !== undefined && !Array.isArray(bag.fills) && (typeof bag.fills === 'string' || isObj(bag.fills))) bag.fills = [bag.fills]
  if (Array.isArray(bag.fills)) bag.fills = bag.fills.map(paint)
  if (bag.color !== undefined) bag.color = paint(bag.color)
  if (bag.stroke !== undefined && bag.stroke !== null) {
    const s = stroke(bag.stroke)
    if (s !== undefined) bag.stroke = isObj(s) ? { ...s, color: paint(s.color) } : s
  }
  if (isObj(bag.shadows)) bag.shadows = [bag.shadows]
  if (Array.isArray(bag.shadows)) {
    bag.shadows = bag.shadows.map((sh) => {
      const out = shadow(sh)
      return isObj(out) ? { ...out, color: paint(out.color) } : out
    })
  }
  return notes
}

// ——— Lot d'opérations ———

export interface Normalized {
  operations: unknown[]
  /** Chemin d'origine de chaque opération normalisée : « operations[3] » ou « operations[3].node.children[1] ». */
  origins: string[]
  /** Identifiants temporaires inventés pour relier des enfants imbriqués : à ne pas renvoyer. */
  generated: Set<string>
  /** Formes adaptées, sans doublon. */
  notes: string[]
}

function collectTempIds(v: unknown, into: Set<string>): Set<string> {
  if (typeof v === 'string' && v.startsWith('$')) into.add(v)
  else if (Array.isArray(v)) v.forEach((x) => collectTempIds(x, into))
  else if (isObj(v)) Object.values(v).forEach((x) => collectTempIds(x, into))
  return into
}

const kindOf = (v: unknown): NodeKind =>
  v === 'frame' || v === 'text' || v === 'shape' || v === 'image' || v === 'icon' ? v : undefined

/**
 * Normalise un lot d'opérations. `typeOf` donne le type d'un élément existant (pour adapter un
 * update) ; les éléments créés plus tôt dans le lot sont connus par leur identifiant temporaire.
 */
export function normalizeOperations(operations: unknown[], typeOf: (id: string) => NodeKind = () => undefined): Normalized {
  const out: unknown[] = []
  const origins: string[] = []
  const generated = new Set<string>()
  const notes = new Set<string>()
  const taken = collectTempIds(operations, new Set())
  const created = new Map<string, NodeKind>()
  let counter = 0
  const tempId = () => {
    let id: string
    do id = `$_${++counter}`
    while (taken.has(id))
    taken.add(id)
    generated.add(id)
    return id
  }

  const pushCreate = (op: Obj, origin: string) => {
    if (!isObj(op.node)) {
      out.push(op)
      origins.push(origin)
      return
    }
    const node = { ...op.node }
    const kind = kindOf(node.type)
    for (const n of normalizeBag(node, kind)) notes.add(n)
    const children = node.children
    const nested = Array.isArray(children)
    if (nested) {
      delete node.children
      if (children.length && typeof node.id !== 'string') node.id = tempId()
    }
    if (typeof node.id === 'string') created.set(node.id, kind)
    out.push({ ...op, node })
    origins.push(origin)
    if (!nested) return
    if (children.length) notes.add('children→create')
    children.forEach((child, j) => {
      pushCreate({ op: 'create', parent: node.id, node: child }, `${origin}.node.children[${j}]`)
    })
  }

  operations.forEach((raw, i) => {
    const origin = `operations[${i}]`
    if (!isObj(raw)) {
      out.push(raw)
      origins.push(origin)
      return
    }
    if (raw.op === 'create') return pushCreate(raw, origin)
    let op: Obj = raw
    if (raw.op === 'update' && isObj(raw.set)) {
      const id = typeof raw.id === 'string' ? raw.id : ''
      const set = { ...raw.set }
      for (const n of normalizeBag(set, created.has(id) ? created.get(id) : typeOf(id))) notes.add(n)
      op = { ...raw, set }
    } else if (raw.op === 'style.color.set' && raw.value !== undefined) {
      op = { ...raw, value: paint(raw.value) }
    }
    out.push(op)
    origins.push(origin)
  })
  return { operations: out, origins, generated, notes: [...notes] }
}

/**
 * Ramène un chemin d'erreur (sur le lot normalisé) au lot envoyé : « operations[7].node.x »
 * devient « operations[5].node.children[1].x » quand l'opération 7 vient d'un enfant imbriqué.
 */
export function originPath(path: string, origins: string[]): string {
  return path.replace(/^operations\[(\d+)\](\.node(?=[.[ ]|$))?/, (whole, n: string, node: string | undefined) => {
    const origin = origins[Number(n)]
    if (origin === undefined) return whole
    if (origin.includes('.children[')) return origin
    return origin + (node ?? '')
  })
}
