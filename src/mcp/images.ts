/**
 * Outil MCP `images` : photos libres (Openverse, Wikimedia Commons) cherchées, posées dans la maquette
 * et créditées. Code pur comme tools.ts : le réseau et le disque passent par `ImageHost` (le principal),
 * l'élément est posé par `ToolHost.apply`, en une seule opération annulable.
 */
import { z } from 'zod'
import type { ApplyResult, Op } from '../core/ops'
import { findNode, walk } from '../core/tree'
import type { MaquetteDocument, Node, NodeInput, Rect } from '../core/types'
import type { ImageCredit, ImageHit, ImagePlace } from '../shared/images'

export interface ImageHost {
  /** Recherche ; `sheet` : planche-contact JPEG des vignettes numérotées (null si aucune n'a chargé). */
  search(query: string, n: number, sheet: boolean): Promise<
    { ok: true; hits: ImageHit[]; sheet: { data: string; mimeType: string } | null; notes: string[] } | { ok: false; message: string }
  >
  place(ref: string | number): Promise<ImagePlace>
  credits(): Promise<ImageCredit[]>
  /** Taille affichée d'un élément (cadre en hug ou fill). */
  measure(id: string): Rect | null
}

interface Host {
  doc(): MaquetteDocument
  pageId(): string
  apply(ops: Op[], label: string): ApplyResult
  images?: ImageHost
}

interface Result { text: string; image?: { data: string; mimeType: string }; isError?: boolean }

export const IMAGES_INPUT = {
  cherche: z.string().trim().min(1).max(200).optional(),
  n: z.number().int().min(1).max(12).optional(),
  planche: z.boolean().optional(),
  poser: z.union([z.string().trim().min(1), z.number().int().min(1)]).optional(),
  dans: z.string().optional(),
  parent: z.string().optional(),
  index: z.number().int().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  fit: z.enum(['cover', 'contain', 'fill']).optional(),
  nom: z.string().min(1).optional(),
  credits: z.literal(true).optional(),
} satisfies z.ZodRawShape

export const IMAGES_DESCRIPTION = [
  'Photos libres (Openverse, Wikimedia ; usage commercial, crédit gardé). Une action par appel :',
  'cherche:"mots anglais", n? (6) → [n,réf,titre,auteur,licence,LxH,vignette] + planche numérotée (planche:false sans)',
  'poser:réf|n → dans assets/ puis posée : dans:id (image, rectangle ou fond de cadre) ou parent?,x?,y?,w?,h? ; fit?, nom?',
  'credits:true → crédits du document',
].join('\n')

type Args = z.infer<z.ZodObject<typeof IMAGES_INPUT>>

const json = (v: unknown) => JSON.stringify(v)
const error = (text: string): Result => ({ text, isError: true })
const DEFAULT_N = 6
/** Largeur d'une photo posée sans taille : une section, pas un écran entier. */
const DEFAULT_WIDTH = 800

export async function runImages(host: Host, a: Args): Promise<Result> {
  const img = host.images
  if (!img) return error('l’outil images n’est pas disponible ici')
  const actions = [a.cherche !== undefined, a.poser !== undefined, a.credits === true].filter(Boolean).length
  if (actions !== 1) return error('une action par appel : cherche, poser ou credits')
  if (a.cherche !== undefined) return search(img, a.cherche, a.n ?? DEFAULT_N, a.planche ?? true)
  if (a.credits) return credits(host, img)
  return place(host, img, a)
}

// ——— cherche ———

const sizeOf = (h: ImageHit) => (h.width && h.height ? `${h.width}x${h.height}` : '?')

async function search(img: ImageHost, query: string, n: number, sheet: boolean): Promise<Result> {
  const r = await img.search(query, n, sheet)
  if (!r.ok) return error(r.message)
  const out: Record<string, unknown> = {
    resultats: r.hits.map((h) => [h.n, h.ref, h.title.slice(0, 80), h.creator.slice(0, 40), h.licence, sizeOf(h), h.thumb]),
  }
  if (r.notes.length) out.notes = r.notes
  return r.sheet ? { text: json(out), image: r.sheet } : { text: json(out) }
}

// ——— credits ———

/** Images du document : seules leurs photos sont créditées (assets/ peut servir à d'autres fichiers). */
function usedSources(doc: MaquetteDocument): Set<string> {
  const used = new Set<string>()
  walk(doc, ({ node }) => {
    if (node.type === 'image') used.add(node.src)
    // Images en remplissage d'un cadre ou d'une forme.
    if (node.type === 'frame' || node.type === 'shape') for (const f of node.fills) if (typeof f === 'object' && 'type' in f && f.type === 'image') used.add(f.src)
  })
  return used
}

async function credits(host: Host, img: ImageHost): Promise<Result> {
  const used = usedSources(host.doc())
  const list = (await img.credits()).filter((c) => used.has(c.file))
  return { text: json({ credits: list.map((c) => [c.file, c.credit, c.page]) }) }
}

// ——— poser ———

type Placement =
  | { kind: 'replace-image'; id: string }
  | { kind: 'replace-shape'; node: Extract<Node, { type: 'shape' }>; parent: string; index: number }
  | { kind: 'frame-background'; id: string; auto: boolean; size: { width: number; height: number }; radius: Extract<Node, { type: 'frame' }>['radius'] }
  | { kind: 'new'; parent: string; auto: boolean }

/** Où va la photo, vérifié avant tout téléchargement : une erreur ne laisse aucun fichier inutile. */
function target(host: Host, img: ImageHost, a: Args): Placement | string {
  const doc = host.doc()
  if (a.dans !== undefined) {
    const loc = findNode(doc, a.dans)
    if (!loc) return `élément introuvable : ${a.dans}`
    const node = loc.node
    if (node.type === 'image') return { kind: 'replace-image', id: node.id }
    if (node.type === 'shape') return { kind: 'replace-shape', node, parent: loc.parent?.id ?? loc.page.id, index: loc.index }
    if (node.type === 'frame') {
      const measured = typeof node.width === 'number' && typeof node.height === 'number' ? null : img.measure(node.id)
      const width = typeof node.width === 'number' ? node.width : measured?.width
      const height = typeof node.height === 'number' ? node.height : measured?.height
      if (!width || !height) return `${node.name} (${node.id}) n’a pas de taille mesurable : donnez-lui une taille, ou posez la photo avec parent/w/h`
      return { kind: 'frame-background', id: node.id, auto: node.layout.mode === 'auto', size: { width: Math.round(width), height: Math.round(height) }, radius: node.radius }
    }
    return `${node.name} est un ${node.type} : visez une image, un rectangle ou un cadre`
  }
  const parent = a.parent ?? host.pageId()
  if (doc.pages.some((p) => p.id === parent)) return { kind: 'new', parent, auto: false }
  const loc = findNode(doc, parent)
  if (!loc) return `parent introuvable : ${parent}`
  if (loc.node.type !== 'frame') return `${loc.node.name} est un ${loc.node.type} : le parent doit être une page ou un cadre`
  return { kind: 'new', parent, auto: loc.node.layout.mode === 'auto' }
}

/** Taille d'une nouvelle photo : celle demandée, l'autre côté au ratio de l'image. */
function newSize(a: Args, width: number, height: number): { width: number; height: number } {
  const ratio = height / Math.max(1, width)
  if (a.w && a.h) return { width: a.w, height: a.h }
  if (a.w) return { width: a.w, height: Math.max(1, Math.round(a.w * ratio)) }
  if (a.h) return { width: Math.max(1, Math.round(a.h / ratio)), height: a.h }
  const w = Math.min(width, DEFAULT_WIDTH)
  return { width: w, height: Math.max(1, Math.round(w * ratio)) }
}

/** Champs d'un rectangle repris par l'image qui le remplace (géométrie, place dans la mise en page, habillage). */
const KEPT = ['name', 'visible', 'locked', 'opacity', 'width', 'height', 'x', 'y', 'position', 'alignSelf', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'radius', 'stroke', 'shadows'] as const

function operations(p: Placement, a: Args, placed: Extract<ImagePlace, { ok: true }>): { ops: Op[]; temp: string | null } {
  const fit = a.fit ?? 'cover'
  const name = a.nom ?? placed.title.slice(0, 60)
  switch (p.kind) {
    case 'replace-image': {
      const set: Record<string, unknown> = { src: placed.src, fit }
      if (a.nom) set.name = a.nom
      return { ops: [{ op: 'update', id: p.id, set }], temp: null }
    }
    case 'replace-shape': {
      const node: Record<string, unknown> = { id: '$photo', type: 'image', src: placed.src, fit }
      for (const k of KEPT) if (p.node[k] !== undefined) node[k] = p.node[k]
      // Une ellipse devient une image aux coins arrondis au maximum.
      if (p.node.shape === 'ellipse') node.radius = 9999
      if (a.nom) node.name = a.nom
      return {
        ops: [{ op: 'delete', id: p.node.id }, { op: 'create', parent: p.parent, index: p.index, node: node as NodeInput & { id: string } }],
        temp: '$photo',
      }
    }
    case 'frame-background': {
      // Hors du flux, sous les autres enfants (indice 0), à la taille du cadre et avec ses coins.
      const node = { id: '$photo', type: 'image', name, src: placed.src, fit, ...(p.auto ? { position: 'absolute' as const } : {}), x: 0, y: 0, ...p.size, radius: p.radius } as const
      return { ops: [{ op: 'create', parent: p.id, index: 0, node }], temp: '$photo' }
    }
    case 'new': {
      const node: Record<string, unknown> = { id: '$photo', type: 'image', name, src: placed.src, fit, ...newSize(a, placed.width, placed.height) }
      if (!p.auto || a.x !== undefined || a.y !== undefined) {
        node.x = a.x ?? 0
        node.y = a.y ?? 0
        if (p.auto) node.position = 'absolute'
      }
      const op: Op = { op: 'create', parent: p.parent, node: node as NodeInput & { id: string }, ...(a.index !== undefined ? { index: a.index } : {}) }
      return { ops: [op], temp: '$photo' }
    }
  }
}

async function place(host: Host, img: ImageHost, a: Args): Promise<Result> {
  const p = target(host, img, a)
  if (typeof p === 'string') return error(p)
  const placed = await img.place(a.poser!)
  if (!placed.ok) return error(placed.message)
  // Le document a pu changer pendant le téléchargement : la cible est revérifiée.
  const again = target(host, img, a)
  if (typeof again === 'string') return error(`${again} (photo gardée dans ${placed.src})`)
  const { ops, temp } = operations(again, a, placed)
  let result: ApplyResult
  try {
    result = host.apply(ops, `Claude : photo ${placed.title.slice(0, 40)}`)
  } catch (e) {
    return error(`photo téléchargée (${placed.src}) mais non posée : ${(e as Error).message}`)
  }
  if (!result.ok) return error(`photo téléchargée (${placed.src}) mais non posée : ${result.errors.map((x) => x.message).join(' ; ')}`)
  const id = temp ? result.ids[temp] : (again as { id: string }).id
  const out: Record<string, unknown> = { ok: true, id, src: placed.src, taille: `${placed.width}x${placed.height}`, credit: placed.credit }
  if (result.fixes.length) out.corrections = result.fixes
  return { text: json(out) }
}
