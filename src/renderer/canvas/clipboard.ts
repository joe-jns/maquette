import { z } from 'zod'
import type { Measure, Op } from '../../core/ops'
import { mapFillColors } from '../../core/paint'
import { HEX_COLOR, NodeSchema } from '../../core/schema'
import { findNode } from '../../core/tree'
import type { Color, ColorStyle, MaquetteDocument, Node, Rect, TextStyle } from '../../core/types'
import { createSubtreeOps, tempIds, topLevel, type CommandOps } from './canvasOps'

/** Point en coordonnées du conteneur cible. */
export interface Point { x: number; y: number }

/** Contenu du presse-papiers propre à Maquette (texte JSON). */
export interface ClipboardPayload {
  format: 'maquette-clipboard'
  version: 1
  /** Copies profondes des éléments copiés, dans l'ordre du document. */
  nodes: Node[]
  /** Styles nommés utilisés par ces éléments, pour coller ailleurs que dans le document d'origine. */
  colors: ColorStyle[]
  text: TextStyle[]
  /**
   * Rectangles mesurés au moment de la copie (dans le parent d'origine), par identifiant d'élément
   * copié. Facultatif : sert à placer un élément qui était en flux et à figer une taille "fill".
   */
  rects?: Record<string, Rect>
}

const Num = z.number()
const ClipboardSchema = z.object({
  format: z.literal('maquette-clipboard'),
  version: z.literal(1),
  nodes: z.array(NodeSchema),
  colors: z.array(z.object({ id: z.string(), name: z.string(), value: z.string().regex(HEX_COLOR) })),
  text: z.array(z.object({
    id: z.string(), name: z.string(), fontFamily: z.string().min(1), fontWeight: Num,
    fontStyle: z.enum(['normal', 'italic']), fontSize: Num, lineHeight: Num, letterSpacing: Num,
  })),
  rects: z.record(z.string(), z.object({ x: Num, y: Num, width: Num, height: Num })).optional(),
})

/** Applique `fn` à chaque couleur d'un élément (remplissages, contour, ombres, couleur du texte). */
function eachColor(node: Node, fn: (c: Color) => Color): void {
  if ('fills' in node) node.fills = node.fills.map((f) => mapFillColors(f, fn))
  if ('stroke' in node && node.stroke) node.stroke.color = fn(node.stroke.color)
  if ('shadows' in node) node.shadows.forEach((sh) => { sh.color = fn(sh.color) })
  if (node.type === 'text' || node.type === 'icon') node.color = fn(node.color)
}

function eachNode(node: Node, fn: (n: Node) => void): void {
  fn(node)
  if (node.type === 'frame') node.children.forEach((c) => eachNode(c, fn))
}

/** Copier (Ctrl+C) : copies profondes et styles nommés utilisés. `measure` permet de retenir la boîte affichée. */
export function copyNodes(doc: MaquetteDocument, ids: readonly string[], measure?: Measure): ClipboardPayload {
  const nodes = topLevel(doc, ids).map((loc) => structuredClone(loc.node))
  const colorIds = new Set<string>()
  const textIds = new Set<string>()
  for (const node of nodes) {
    eachNode(node, (n) => {
      eachColor(n, (c) => {
        if (typeof c === 'object') colorIds.add(c.style)
        return c
      })
      if (n.type === 'text' && n.textStyle) textIds.add(n.textStyle)
    })
  }
  const payload: ClipboardPayload = {
    format: 'maquette-clipboard',
    version: 1,
    nodes,
    colors: structuredClone(doc.styles.colors.filter((s) => colorIds.has(s.id))),
    text: structuredClone(doc.styles.text.filter((s) => textIds.has(s.id))),
  }
  if (measure) {
    const rects: Record<string, Rect> = {}
    for (const node of nodes) {
      const r = measure(node.id)
      if (r) rects[node.id] = { ...r }
    }
    payload.rects = rects
  }
  return payload
}

/** Lit le texte du presse-papiers ; `null` s'il ne s'agit pas d'un contenu Maquette valide. */
export function parseClipboard(text: string): ClipboardPayload | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = ClipboardSchema.safeParse(raw)
  return parsed.success ? (parsed.data as ClipboardPayload) : null
}

/** Remplace les références à des styles absents du document par leur valeur. */
function detachMissingStyles(doc: MaquetteDocument, payload: ClipboardPayload, node: Node): void {
  const colors = new Set(doc.styles.colors.map((s) => s.id))
  const texts = new Set(doc.styles.text.map((s) => s.id))
  eachNode(node, (n) => {
    eachColor(n, (c) => {
      if (typeof c !== 'object' || colors.has(c.style)) return c
      return payload.colors.find((s) => s.id === c.style)?.value ?? '#000000'
    })
    if (n.type === 'text' && n.textStyle && !texts.has(n.textStyle)) {
      const style = payload.text.find((s) => s.id === n.textStyle)
      if (style) {
        const { id: _id, name: _name, ...font } = style
        Object.assign(n, font)
      }
      delete n.textStyle
    }
  })
}

/**
 * Coller (Ctrl+V) : recrée chaque sous-arbre (un `create` par élément, identifiants temporaires).
 * Hors flux : positions relatives conservées, boîte des éléments collés placée à `at` (sinon
 * décalée de +10/+10). Dans un cadre automatique : en flux, à la fin, sans x/y.
 */
export function pasteOps(
  doc: MaquetteDocument,
  payload: ClipboardPayload,
  target: { parent: string; at?: Point },
): CommandOps {
  // Conteneur réel : une page, un cadre ; sur un autre élément, son parent ; inconnu, la première page.
  let parent = target.parent
  let auto = false
  if (!doc.pages.some((p) => p.id === parent)) {
    const loc = findNode(doc, parent)
    if (!loc) parent = doc.pages[0]!.id
    else if (loc.node.type === 'frame') auto = loc.node.layout.mode === 'auto'
    else {
      parent = loc.parent?.id ?? loc.page.id
      auto = loc.parent?.layout.mode === 'auto'
    }
  }

  const nodes = payload.nodes.map((n) => {
    const copy = structuredClone(n)
    detachMissingStyles(doc, payload, copy)
    return copy
  })
  const origin = (n: Node) => ({ x: n.x ?? payload.rects?.[n.id]?.x ?? 0, y: n.y ?? payload.rects?.[n.id]?.y ?? 0 })
  const minX = Math.min(...nodes.map((n) => origin(n).x))
  const minY = Math.min(...nodes.map((n) => origin(n).y))
  const dx = target.at ? target.at.x - minX : 10
  const dy = target.at ? target.at.y - minY : 10

  const tmp = tempIds('p')
  const ops: Op[] = []
  const select = nodes.map((node) => createSubtreeOps(node, parent, undefined, tmp, ops, (input) => {
    input.position = 'flow'
    if (auto) {
      delete input.x
      delete input.y
      return
    }
    // Hors d'un cadre automatique : "fill" n'a plus de sens, la taille est figée.
    for (const axis of ['width', 'height'] as const) {
      const size = input[axis]
      if (typeof size === 'object' && size !== null && (size as { mode: string }).mode === 'fill') {
        input[axis] = Math.round(payload.rects?.[node.id]?.[axis] ?? 100)
      }
    }
    delete input.alignSelf
    const autoSelf = node.type === 'frame' && node.layout.mode === 'auto'
    if (!autoSelf) for (const key of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']) delete input[key]
    const o = origin(node)
    input.x = o.x + dx
    input.y = o.y + dy
  }))
  return { ops, select }
}
