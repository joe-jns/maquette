import type { Op } from '../../core/ops'
import { findNode, isFill, isHug, type NodeLocation } from '../../core/tree'
import type { Axis, MaquetteDocument, Rect } from '../../core/types'

/**
 * Calcule la valeur d'un champ numérique : nombres décimaux (point ou virgule),
 * `+ - * /`, parenthèses et moins unaire. Toute autre saisie, ou un résultat non fini, donne `null`.
 * Analyseur maison (descente récursive) : aucun `eval`.
 */
export function evalNumber(input: string): number | null {
  const src = input.replace(/\s+/g, '')
  if (src === '') return null
  let pos = 0

  const fail = (): never => {
    throw new SyntaxError('saisie invalide')
  }

  const number = (): number => {
    const m = /^(\d+(?:[.,]\d+)?|[.,]\d+)/.exec(src.slice(pos))
    if (!m) return fail()
    pos += m[0].length
    return Number(m[0].replace(',', '.'))
  }

  const primary = (): number => {
    if (src[pos] === '(') {
      pos++
      const v = expr()
      if (src[pos] !== ')') return fail()
      pos++
      return v
    }
    return number()
  }

  const unary = (): number => {
    if (src[pos] === '-') {
      pos++
      return -unary()
    }
    return primary()
  }

  const term = (): number => {
    let v = unary()
    while (src[pos] === '*' || src[pos] === '/') {
      const op = src[pos++]
      const r = unary()
      v = op === '*' ? v * r : v / r
    }
    return v
  }

  const expr = (): number => {
    let v = term()
    while (src[pos] === '+' || src[pos] === '-') {
      const op = src[pos++]
      const r = term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }

  try {
    const v = expr()
    if (pos !== src.length || !Number.isFinite(v)) return null
    return v
  } catch {
    return null
  }
}

/** Au plus 2 décimales, sans zéros inutiles ; `-0` s'affiche `0`. */
export function formatNumber(n: number): string {
  // toPrecision absorbe l'erreur binaire (12.345 * 100 = 1234.4999…) avant l'arrondi.
  const scaled = Number((Math.abs(n) * 100).toPrecision(15))
  const v = (Math.sign(n) * Math.round(scaled)) / 100
  return String(v === 0 ? 0 : v)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** `null` si la liste est vide, la valeur commune si toutes sont égales (structurellement), sinon `'mixed'`. */
export function mixed<T>(values: T[]): T | 'mixed' | null {
  if (values.length === 0) return null
  const first = values[0] as T
  return values.every((v) => deepEqual(v, first)) ? first : 'mixed'
}

export type SizeChoice = 'fixed' | 'hug' | 'fill'
export interface ChoiceState { ok: boolean; reason?: string }

const HUG_REASON = 'S’adapter au contenu : réservé aux textes et aux cadres en mise en page automatique'
const FILL_REASON = 'Remplir : réservé aux enfants d’un cadre en mise en page automatique'
const HUG_FILL_CHILD_REASON = 'S’adapter au contenu : impossible, un enfant remplit déjà ce cadre sur cet axe'
const FILL_HUG_PARENT_REASON = 'Remplir : impossible, le cadre parent s’adapte déjà à son contenu sur cet axe'

const inFlow = (loc: NodeLocation): boolean => loc.parent?.layout.mode === 'auto' && loc.node.position === 'flow'

function choicesAt(loc: NodeLocation | null, axis: Axis): Record<SizeChoice, ChoiceState> {
  const fixed: ChoiceState = { ok: true }
  if (!loc) return { fixed, hug: { ok: false, reason: HUG_REASON }, fill: { ok: false, reason: FILL_REASON } }
  const { node, parent } = loc

  let hug: ChoiceState
  const autoSelf = node.type === 'frame' && node.layout.mode === 'auto'
  if (node.type !== 'text' && !autoSelf) hug = { ok: false, reason: HUG_REASON }
  else if (node.type === 'frame' && node.children.some((c) => c.position === 'flow' && isFill(c[axis]))) {
    // Règle du noyau : un cadre en hug ne peut pas contenir un enfant en fill sur le même axe.
    hug = { ok: false, reason: HUG_FILL_CHILD_REASON }
  } else hug = { ok: true }

  let fill: ChoiceState
  if (!inFlow(loc)) fill = { ok: false, reason: FILL_REASON }
  else if (parent && isHug(parent[axis])) fill = { ok: false, reason: FILL_HUG_PARENT_REASON }
  else fill = { ok: true }

  return { fixed, hug, fill }
}

/** Les choix de taille possibles pour un élément sur un axe, avec la raison quand un choix est grisé. */
export function sizingChoices(doc: MaquetteDocument, id: string, axis: Axis): Record<SizeChoice, ChoiceState> {
  return choicesAt(findNode(doc, id), axis)
}

/**
 * Opérations pour passer `ids` au choix de taille donné. Les éléments où le choix est impossible sont ignorés.
 * `fixed` reprend la valeur actuelle si elle est déjà fixe, sinon la taille mesurée arrondie.
 */
export function sizeOps(
  doc: MaquetteDocument,
  ids: string[],
  axis: Axis,
  choice: SizeChoice,
  measure: (id: string) => Rect | undefined,
): Op[] {
  const ops: Op[] = []
  for (const id of ids) {
    const loc = findNode(doc, id)
    if (!loc || !choicesAt(loc, axis)[choice].ok) continue
    let value: number | { mode: 'hug' } | { mode: 'fill' }
    if (choice === 'fixed') {
      const current = loc.node[axis]
      if (typeof current === 'number') value = current
      else {
        const rect = measure(id)
        if (!rect) continue
        value = Math.max(0, Math.round(rect[axis]))
      }
    } else value = { mode: choice }
    ops.push({ op: 'update', id, set: { [axis]: value } })
  }
  return ops
}

/** Une opération `update` par élément, avec le même `set`. */
export function setOps(ids: string[], set: Record<string, unknown>): Op[] {
  return ids.map((id) => ({ op: 'update', id, set: { ...set } }))
}

/** Opérations pour placer `ids` sur un axe ; les enfants en flux (position calculée) sont ignorés. */
export function positionOps(doc: MaquetteDocument, ids: string[], axis: 'x' | 'y', value: number): Op[] {
  const ops: Op[] = []
  for (const id of ids) {
    const loc = findNode(doc, id)
    if (!loc || inFlow(loc)) continue
    ops.push({ op: 'update', id, set: { [axis]: value } })
  }
  return ops
}
