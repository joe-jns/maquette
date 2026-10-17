/**
 * Outils MCP de Maquette, en code pur : ni Electron, ni DOM, ni Node.
 * Importé par la fenêtre (qui détient le document) et par le relais (qui publie les schémas).
 * Réponses compactes (spec §9, « Économie de tokens ») : JSON minifié, valeurs par défaut omises.
 */
import { z } from 'zod'
import { createNode } from '../core/defaults'
import type { ApplyResult, Op } from '../core/ops'
import { formatPath } from '../core/rules'
import { findNode, walk } from '../core/tree'
import type { MaquetteDocument, Node, NodeInput, Size } from '../core/types'
import { IMAGES_DESCRIPTION, IMAGES_INPUT, runImages, type ImageHost } from './images'
import { ALIASES, normalizeOperations, originPath } from './normalize'

export interface ToolHost {
  doc(): MaquetteDocument
  pageId(): string
  selection(): string[]
  apply(ops: Op[], label: string): ApplyResult
  capture(id: string, width: number): Promise<{ data: string; mimeType: string } | null>
  /** Contrôle taste-skill d'un cadre (rendu réel) ; null si impossible. */
  check(id: string): Promise<{ findings: { level: 'FAIL' | 'WARN'; id: string; message: string; fix: string }[]; isPage: boolean } | null>
  /** Photos libres (outil images) ; absent : l'outil répond qu'il n'est pas disponible. */
  images?: ImageHost
}

export interface ToolResult { text: string; image?: { data: string; mimeType: string }; isError?: boolean }

export interface ToolDef { name: string; description: string; input: z.ZodRawShape }

const MAX_ERRORS = 5

const INPUTS = {
  lire_document: {},
  lire_elements: {
    ids: z.array(z.string()).min(1).max(20),
    profondeur: z.number().int().min(0).max(5).optional(),
  },
  chercher: {
    nom: z.string().optional(),
    type: z.enum(['frame', 'text', 'shape', 'image']).optional(),
    texte: z.string().optional(),
    limite: z.number().int().min(1).max(100).optional(),
  },
  appliquer: {
    operations: z.array(z.looseObject({ op: z.string() })).min(1).max(500),
    libelle: z.string().optional(),
  },
  capture: {
    id: z.string(),
    largeur: z.number().int().min(100).max(1600).optional(),
  },
  selection: {},
  verifier_gout: { id: z.string() },
  images: IMAGES_INPUT,
} satisfies Record<string, z.ZodRawShape>

type ToolName = keyof typeof INPUTS

export const TOOLS: ToolDef[] = [
  {
    name: 'lire_document',
    description:
      'Résumé du document : pages et leurs éléments de premier niveau (l/h = largeur/hauteur en px, "hug" ou "fill" ; enfants = nombre), couleurs et styles de texte nommés. Point de départ avant toute modification.',
    input: INPUTS.lire_document,
  },
  {
    name: 'lire_elements',
    description:
      'Détail d’éléments par identifiant (1 à 20). Seules les propriétés différentes des valeurs par défaut sont renvoyées. Au-delà de « profondeur » (0 à 5, défaut 1), children devient "enfants":N.',
    input: INPUTS.lire_elements,
  },
  {
    name: 'chercher',
    description:
      'Cherche dans toutes les pages par nom, type ou contenu de texte (sous-chaîne, sans casse ; critères cumulés). Renvoie [id, type, nom, parent|null] et "plus" = résultats non montrés.',
    input: INPUTS.chercher,
  },
  {
    name: 'appliquer',
    description: [
      'Lot atomique (tout ou rien) d’opérations "op" :',
      'create {parent,index?,node:{type,…}}',
      'update {id,set}',
      'move {id,parent,index?,x?,y?}',
      'delete {id}',
      'page.create {name,index?}, page.update {id,name}, page.delete {id}, page.move {id,index}',
      'style.color.set {id?,name,value}, style.text.set, style.delete {id}',
      'id "$nom" = identifiant temporaire. Tailles : nombre|{mode:"hug"}|{mode:"fill"}. Tout en px.',
    ].join('\n'),
    input: INPUTS.appliquer,
  },
  {
    name: 'capture',
    description: 'Image JPEG d’un élément pour vérifier le rendu (largeur 100 à 1600 px, défaut 800). À demander seulement quand c’est utile.',
    input: INPUTS.capture,
  },
  {
    name: 'selection',
    description: 'Éléments sélectionnés par l’utilisateur dans Maquette (id, type, nom).',
    input: INPUTS.selection,
  },
  {
    name: 'verifier_gout',
    description: 'Contrôle taste-skill d’un cadre sur son rendu réel : [niveau, règle, message, correction] (au plus 15), "page" = cadre de la taille d’une page. À lancer après une section ou une page.',
    input: INPUTS.verifier_gout,
  },
  { name: 'images', description: IMAGES_DESCRIPTION, input: INPUTS.images },
]

const json = (value: unknown): string => JSON.stringify(value)
const ok = (value: unknown): ToolResult => ({ text: json(value) })
const error = (text: string): ToolResult => ({ text, isError: true })

export async function runTool(host: ToolHost, name: string, args: unknown): Promise<ToolResult> {
  if (!Object.hasOwn(INPUTS, name)) return error(`outil inconnu : ${name}`)
  const tool = name as ToolName
  const parsed = z.strictObject(INPUTS[tool]).safeParse(args ?? {})
  if (!parsed.success) {
    const lines = parsed.error.issues.slice(0, MAX_ERRORS).map((i) => `${formatPath(i.path) || '(arguments)'} : ${i.message}`)
    return error(`arguments invalides pour ${name} :\n${lines.join('\n')}`)
  }
  const a = parsed.data as Record<string, unknown>
  switch (tool) {
    case 'lire_document':
      return ok(readDocument(host))
    case 'lire_elements':
      return ok(readElements(host.doc(), a.ids as string[], (a.profondeur as number | undefined) ?? 1))
    case 'chercher':
      return ok(search(host.doc(), a as SearchArgs))
    case 'appliquer':
      return apply(host, a.operations as unknown[], a.libelle as string | undefined)
    case 'capture':
      return capture(host, a.id as string, (a.largeur as number | undefined) ?? 800)
    case 'selection':
      return ok(selection(host))
    case 'verifier_gout':
      return checkTaste(host, a.id as string)
    case 'images':
      return runImages(host, parsed.data as Parameters<typeof runImages>[1])
  }
}

// ——— lire_document ———

const sizeLabel = (s: Size): number | string => (typeof s === 'number' ? s : s.mode)

function countNodes(nodes: Node[]): number {
  return nodes.reduce((n, node) => n + 1 + (node.type === 'frame' ? countNodes(node.children) : 0), 0)
}

function readDocument(host: ToolHost) {
  const doc = host.doc()
  const out: Record<string, unknown> = {
    page_active: host.pageId(),
    total: doc.pages.reduce((n, p) => n + countNodes(p.children), 0),
    pages: doc.pages.map((p) => ({
      id: p.id,
      nom: p.name,
      elements: p.children.map((node) => {
        const e: Record<string, unknown> = {
          id: node.id, type: node.type, nom: node.name, l: sizeLabel(node.width), h: sizeLabel(node.height),
        }
        if (node.x) e.x = node.x
        if (node.y) e.y = node.y
        if (node.type === 'frame' && node.children.length) e.enfants = node.children.length
        return e
      }),
    })),
  }
  if (doc.styles.colors.length) out.couleurs = Object.fromEntries(doc.styles.colors.map((s) => [s.name, s.value]))
  if (doc.styles.text.length) {
    out.textes = Object.fromEntries(doc.styles.text.map((s) => [
      s.name,
      `${s.fontFamily} ${s.fontWeight}${s.fontStyle === 'italic' ? ' italique' : ''} ${s.fontSize}/${s.lineHeight}`,
    ]))
  }
  return out
}

// ——— lire_elements ———

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.hasOwn(b, k) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/**
 * Élément par défaut comparable : même type, même forme. Pour un texte, l'interligne par défaut
 * est celui de sa taille de police ; la taille elle-même reste comparée à la taille par défaut.
 */
function defaultsFor(node: Node): Record<string, unknown> {
  const input: NodeInput =
    node.type === 'shape' ? { type: 'shape', shape: node.shape }
      : node.type === 'text' ? { type: 'text', fontSize: node.fontSize }
        : { type: node.type }
  const base = createNode(input, node.id) as unknown as Record<string, unknown>
  if (node.type === 'text') base.fontSize = (createNode({ type: 'text' }, node.id) as Extract<Node, { type: 'text' }>).fontSize
  return base
}

function compact(node: Node, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = { id: node.id, type: node.type, name: node.name }
  const base = defaultsFor(node)
  for (const [key, value] of Object.entries(node)) {
    if (key in out || key === 'children') continue
    if (!same(value, base[key])) out[key] = value
  }
  if (node.type === 'frame' && node.children.length) {
    if (depth > 0) out.children = node.children.map((c) => compact(c, depth - 1))
    else out.enfants = node.children.length
  }
  return out
}

function readElements(doc: MaquetteDocument, ids: string[], depth: number) {
  return {
    elements: ids.map((id) => {
      const loc = findNode(doc, id)
      return loc ? compact(loc.node, depth) : { id, erreur: 'introuvable' }
    }),
  }
}

// ——— chercher ———

interface SearchArgs { nom?: string; type?: Node['type']; texte?: string; limite?: number }

function search(doc: MaquetteDocument, args: SearchArgs) {
  const limit = args.limite ?? 30
  const nom = args.nom?.toLowerCase()
  const texte = args.texte?.toLowerCase()
  const resultats: [string, string, string, string | null][] = []
  let plus = 0
  walk(doc, ({ node, parent }) => {
    if (args.type && node.type !== args.type) return
    if (nom !== undefined && !node.name.toLowerCase().includes(nom)) return
    if (texte !== undefined && !(node.type === 'text' && node.content.toLowerCase().includes(texte))) return
    if (resultats.length < limit) resultats.push([node.id, node.type, node.name, parent?.id ?? null])
    else plus++
  })
  return plus ? { resultats, plus } : { resultats }
}

// ——— appliquer ———

const str = z.string()
const num = z.number()
const optIndex = z.number().int().optional()
const OpSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('create'), parent: str, index: optIndex,
    node: z.looseObject({ type: z.enum(['frame', 'text', 'shape', 'image']), id: str.optional() }),
  }),
  z.strictObject({ op: z.literal('update'), id: str, set: z.record(z.string(), z.unknown()) }),
  z.strictObject({ op: z.literal('move'), id: str, parent: str, index: optIndex, x: num.optional(), y: num.optional() }),
  z.strictObject({ op: z.literal('delete'), id: str }),
  z.strictObject({ op: z.literal('page.create'), id: str.optional(), name: str.min(1), index: optIndex }),
  z.strictObject({ op: z.literal('page.update'), id: str, name: str.min(1) }),
  z.strictObject({ op: z.literal('page.delete'), id: str }),
  z.strictObject({ op: z.literal('page.move'), id: str, index: z.number().int() }),
  z.strictObject({ op: z.literal('style.color.set'), id: str.optional(), name: str.min(1), value: str }),
  z.strictObject({
    op: z.literal('style.text.set'), id: str.optional(), name: str.min(1),
    fontFamily: str.min(1), fontWeight: num, fontStyle: z.enum(['normal', 'italic']),
    fontSize: num, lineHeight: num, letterSpacing: num,
  }),
  z.strictObject({ op: z.literal('style.delete'), id: str }),
])

interface Erreur { chemin: string; message: string }

function withHint(message: string): string {
  const keys = /Unrecognized keys?: (.+)/.exec(message)?.[1]?.match(/"([^"]+)"/g)?.map((k) => k.slice(1, -1)) ?? []
  const hints = keys.filter((k) => ALIASES[k]).map((k) => `${k} → ${ALIASES[k]}`)
  return hints.length ? `${message} (${hints.join(', ')})` : message
}

const refused = (erreurs: Erreur[], origins: string[] = []): ToolResult =>
  error(json({
    ok: false,
    erreurs: erreurs.slice(0, MAX_ERRORS).map((e) => ({ chemin: originPath(e.chemin, origins), message: withHint(e.message) })),
  }))

function apply(host: ToolHost, operations: unknown[], libelle: string | undefined): ToolResult {
  // Formes naturelles (alias, peintures objet, enfants imbriqués) ramenées à la forme canonique.
  const norm = normalizeOperations(operations, (id) => findNode(host.doc(), id)?.node.type)
  const parsed = z.array(OpSchema).safeParse(norm.operations)
  if (!parsed.success) {
    return refused(parsed.error.issues.map((i) => ({ chemin: formatPath(['operations', ...i.path]), message: i.message })), norm.origins)
  }
  let result: ApplyResult
  try {
    result = host.apply(parsed.data as Op[], `Claude : ${libelle?.trim() || 'modification'}`)
  } catch (e) {
    return refused([{ chemin: 'operations', message: e instanceof Error ? e.message : String(e) }])
  }
  if (!result.ok) {
    return refused(result.errors.map((x) => ({ chemin: x.path.replace(/^ops\[/, 'operations['), message: x.message })), norm.origins)
  }
  const out: Record<string, unknown> = { ok: true }
  const ids = Object.fromEntries(Object.entries(result.ids).filter(([k]) => !norm.generated.has(k)))
  if (Object.keys(ids).length) out.ids = ids
  if (result.fixes.length) out.corrections = result.fixes
  if (norm.notes.length) out.adapte = norm.notes
  return ok(out)
}

// ——— capture et sélection ———

async function capture(host: ToolHost, id: string, width: number): Promise<ToolResult> {
  const loc = findNode(host.doc(), id)
  if (!loc) return error(`élément introuvable : ${id}`)
  const image = await host.capture(id, width)
  if (!image) return error(`capture impossible pour ${loc.node.name} (${id})`)
  const { node } = loc
  return { text: `capture de ${node.name} (${sizeLabel(node.width)}×${sizeLabel(node.height)})`, image }
}

function selection(host: ToolHost) {
  const doc = host.doc()
  const ids = host.selection()
  const elements = ids.flatMap((id) => {
    const node = findNode(doc, id)?.node
    return node ? [{ id: node.id, type: node.type, nom: node.name }] : []
  })
  return elements
}

// ——— verifier_gout ———

const MAX_FINDINGS = 15

async function checkTaste(host: ToolHost, id: string): Promise<ToolResult> {
  const loc = findNode(host.doc(), id)
  if (!loc) return error(`élément introuvable : ${id}`)
  if (loc.node.type !== 'frame') return error(`${loc.node.name} n’est pas un cadre : le contrôle porte sur un cadre (section ou page)`)
  const r = await host.check(id)
  if (!r) return error(`contrôle impossible pour ${loc.node.name} (masqué, ou rendu trop long)`)
  const fautes = r.findings.slice(0, MAX_FINDINGS).map((f) => [f.level, f.id, f.message, f.fix])
  const out: Record<string, unknown> = { fautes, page: r.isPage }
  if (r.findings.length > MAX_FINDINGS) out.plus = r.findings.length - MAX_FINDINGS
  return ok(out)
}
