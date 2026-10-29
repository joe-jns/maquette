import { normalizeColor } from '../color'
import { CHILDREN_OVERRIDE, deepEqual, repairComponents, ROOT_LOCAL_KEYS, syncInstances } from '../components'
import { newId as makeId } from '../ids'
import { penIconSet, resolveIconIn } from '../icons/sets'
import { validateDocument } from '../rules'
import type {
  Align, AutoLayout, Color, ColorStyle, Fill, FrameNode, IconNode, Justify, MaquetteDocument, Node, Paint, Radius, Shadow,
  ShapeNode, Size, Stroke, TextNode, VectorNode,
} from '../types'
import { isValidPath, pathBounds } from '../vector'
import { arcPath, penConic, penLinear, penRadial, polygonPath, type PenGradientGeometry, type PenStop } from './geometry'
import { LATEST_PEN_VERSION, migratePen, parsePenVersion } from './migrate'
import { R, ReportBuilder, type ImportReport } from './report'

/**
 * Conversion d'un document Pen (.pen, JSON en clair) en document Maquette. Code pur : aucun accès
 * disque, les images sont résolues par l'appelant (`options.image`). Référence du format :
 * docs/research/pen-document-model.md ; correspondances : spec 2026-10-29, étape 3.
 *
 * Grandes lignes :
 * - une page « Page 1 » ; les calques de premier niveau gardent leur x/y ;
 * - variables de couleur → couleurs nommées (valeur du premier thème de chaque axe) ; un sous-arbre
 *   d'un autre thème reçoit les valeurs en dur ; nombres, textes, booléens → valeurs en dur ;
 * - `reusable` → composant principal ; `ref` → instance : le composant est déplié au niveau Pen
 *   (surcharges de la racine, `descendants` par chemin d'ids, remplacements, slots, instances
 *   imbriquées), converti, puis relié à son principal (`source` par chemin d'ids, `overrides` =
 *   propriétés qui diffèrent du principal) ;
 * - ce qui ne passe pas tel quel est compté dans le rapport.
 */

export class PenImportError extends Error {}

export interface PenImportOptions {
  /** `src` du document pour l'url d'une image du .pen (telle qu'écrite dans le fichier), ou null si introuvable. */
  image?: (url: string) => string | null
}

export interface PenImportResult { doc: MaquetteDocument; report: ImportReport }

type P = Record<string, unknown>
const isObj = (v: unknown): v is P => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v])
const VALID_ID = /^[^/$][^/]*$/
const round2 = (n: number) => Math.round(n * 100) / 100

type Theme = Record<string, string>

/** Parent Maquette d'un calque converti : cadre automatique (et sa direction) ou non ; null = la page. */
interface ParentInfo { auto: boolean; dir: 'row' | 'column' }
interface Ctx { theme: Theme; parent: ParentInfo | null }

/** Ce que l'on sait d'un calque Pen déplié dans une instance. */
interface Meta {
  /** Chemin d'ids depuis la racine de l'instance dépliée (`""` pour la racine). */
  path: string
  /** Racine d'une instance dépliée (pas une copie imbriquée). */
  root?: boolean
  /** Racine d'une instance posée dans le document : id du `ref` d'origine. */
  refId?: string
  /** Instance (racine ou copie imbriquée) : id Pen du composant suivi. */
  instanceOf?: string
  /** Enfants fournis par l'instance (slot). */
  localChildren?: boolean
  /** Remplacement complet du calque du composant. */
  replaced?: boolean
  /** Variante (`ref` réutilisable) : composant indépendant, sans lien. */
  variant?: boolean
}

/** Interligne « auto » de Pen (métriques de la police), en multiple de la taille, pour les familles courantes. */
const AUTO_LINE_HEIGHT: Record<string, number> = {
  inter: 1.21, 'inter tight': 1.21, 'inter display': 1.21, roboto: 1.17, 'roboto mono': 1.32, poppins: 1.5,
  'jetbrains mono': 1.32, 'ibm plex mono': 1.3, 'ibm plex sans': 1.3, geist: 1.2, 'geist mono': 1.2,
  'dm sans': 1.3, manrope: 1.37, nunito: 1.364, fredoka: 1.21, newsreader: 1.28, 'instrument serif': 1.24,
  'instrument sans': 1.2, switzer: 1.2, 'funnel sans': 1.2, 'source serif 4': 1.25, 'bricolage grotesque': 1.2,
  'space grotesk': 1.276, 'plus jakarta sans': 1.26, outfit: 1.26, 'work sans': 1.173, lato: 1.2, 'open sans': 1.362,
  montserrat: 1.219, 'playfair display': 1.333, 'noto sans': 1.362, 'mrs saint delafield': 1.4,
}
export const autoLineHeight = (family: string): number => AUTO_LINE_HEIGHT[family.trim().toLowerCase()] ?? 1.2

const FONT_WEIGHTS: Record<string, number> = {
  thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, normal: 400, regular: 400, book: 400,
  medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
}

const JUSTIFY: Record<string, Justify> = { start: 'start', center: 'center', end: 'end', space_between: 'space-between', space_around: 'space-around' }
const ALIGN: Record<string, Align> = { start: 'start', center: 'center', end: 'end' }
const NOTE_TYPES = new Set(['note', 'prompt', 'context'])
const SKIPPED_TYPES = new Set(['script', 'browser'])
/** Clés propres à un calque, jamais comparées entre une copie et son principal. */
const OWN = new Set(['id', 'type', 'children', 'source', 'overrides', 'component'])
const FILL: Size = { mode: 'fill' }
const HUG: Size = { mode: 'hug' }

/** Url des images en remplissage citées par un document Pen (pour que l'appelant les prépare). */
export function penImageUrls(json: unknown): string[] {
  const found = new Set<string>()
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit)
    if (!isObj(v)) return
    if (v.type === 'image' && typeof v.url === 'string' && v.url) found.add(v.url)
    for (const x of Object.values(v)) if (typeof x === 'object') visit(x)
  }
  if (isObj(json)) visit(json.children)
  return [...found]
}

/** Lit un texte .pen (JSON) ; erreur claire si ce n'en est pas un. */
export function parsePenText(text: string): P {
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new PenImportError('this file is not a readable Pen document (invalid JSON)')
  }
  return checkPen(raw)
}

function checkPen(raw: unknown): P {
  if (!isObj(raw) || !Array.isArray(raw.children)) throw new PenImportError('this file is not a Pen document')
  const v = parsePenVersion(raw.version)
  if (!v) throw new PenImportError('this file is not a Pen document (version missing)')
  if (v[0] !== LATEST_PEN_VERSION[0]) throw new PenImportError(`unsupported Pen format version ${String(raw.version)}`)
  return raw
}

/** Convertit un document Pen. Lève PenImportError pour une entrée qui n'est pas un .pen lisible. */
export function importPen(json: unknown, options: PenImportOptions = {}): PenImportResult {
  const raw = typeof json === 'string' ? parsePenText(json) : checkPen(json)
  return new Importer(raw, options).run()
}

class Importer {
  private readonly report = new ReportBuilder()
  private readonly pen: P
  private readonly vars = new Map<string, { type: string; value: unknown }>()
  private readonly defaultTheme: Theme = {}
  private readonly styles: ColorStyle[] = []
  private readonly styleByVar = new Map<string, ColorStyle>()
  private readonly taken = new Set<string>()
  private readonly used = new Set<string>()
  private readonly reusable = new Map<string, P>()
  private readonly meta = new WeakMap<P, Meta>()
  /** Calque Maquette de chaque nœud Pen converti (original ou déplié). */
  private readonly converted = new Map<P, Node>()
  /** Nœud Pen d'origine de chaque calque Maquette. */
  private readonly penOf = new Map<Node, P>()
  /** Principaux : id Pen du composant → nœud Pen racine converti (cadre). */
  private readonly mainPen = new Map<string, P>()
  private readonly pathCache = new Map<string, Map<string, Node>>()

  constructor(raw: P, private readonly options: PenImportOptions) {
    const version = parsePenVersion(raw.version)!
    if (version[1] > LATEST_PEN_VERSION[1]) this.report.add(R.newerVersion)
    this.pen = migratePen(raw, version)
  }

  run(): PenImportResult {
    this.readVariables()
    if (isObj(this.pen.imports) && Object.keys(this.pen.imports).length) this.report.add(R.imports, Object.keys(this.pen.imports).length)
    if (Array.isArray(this.pen.fonts) && this.pen.fonts.length) {
      this.report.add(R.fontsDeclared, new Set(this.pen.fonts.map((f) => (isObj(f) ? f.name : f))).size)
    }
    const top = (this.pen.children as unknown[]).filter(isObj)
    this.collect(top)
    const ctx: Ctx = { theme: { ...this.defaultTheme }, parent: null }
    const children = top.map((c) => this.node(c, ctx)).filter((n): n is Node => n !== null)
    let doc: MaquetteDocument = {
      format: 'maquette',
      version: 1,
      styles: { colors: this.styles, text: [] },
      pages: [{ id: this.newId(), name: 'Page 1', children }],
    }
    this.link(children)
    // Filet de sécurité : boucle entre composants (A contient B qui contient A…) → instance détachée.
    repairComponents(doc, () => this.report.add(R.componentCycle))
    try {
      doc = syncInstances(doc)
    } catch {
      // Boucle de composants : déjà évitée au dépliage ; la validation tranchera.
    }
    const issues = validateDocument(doc)
    if (issues.length) throw new PenImportError(`conversion produced an invalid document: ${issues[0]!.path} ${issues[0]!.message}`)
    return { doc, report: this.report.build() }
  }

  // ——— Identifiants ———

  private newId(): string {
    const id = makeId(this.taken)
    this.taken.add(id)
    this.used.add(id)
    return id
  }

  /** L'id Pen d'un calque d'origine s'il est libre et valable, sinon un nouveau. */
  private idFor(p: P): string {
    const id = typeof p.id === 'string' ? p.id : ''
    if (!this.meta.has(p) && VALID_ID.test(id) && !this.used.has(id)) {
      this.used.add(id)
      return id
    }
    return this.newId()
  }

  /** Réserve les ids d'origine et repère les composants (`reusable`). */
  private collect(list: P[]): void {
    for (const p of list) {
      if (typeof p.id === 'string') this.taken.add(p.id)
      if (p.reusable === true && typeof p.id === 'string' && !this.reusable.has(p.id)) this.reusable.set(p.id, p)
      if (Array.isArray(p.children)) this.collect(p.children.filter(isObj))
    }
  }

  // ——— Variables et thèmes ———

  private readVariables(): void {
    if (isObj(this.pen.themes)) {
      for (const [axis, values] of Object.entries(this.pen.themes)) {
        if (!Array.isArray(values) || !values.length) continue
        this.defaultTheme[axis] = String(values[0])
        if (values.length > 1) this.report.add(R.theme, values.length - 1)
      }
    }
    if (!isObj(this.pen.variables)) return
    for (const [name, v] of Object.entries(this.pen.variables)) {
      if (isObj(v) && typeof v.type === 'string') this.vars.set(name, { type: v.type, value: v.value })
    }
    for (const [name, v] of this.vars) {
      if (v.type !== 'color') continue
      const hex = this.hex(this.resolveVar(name, this.defaultTheme))
      if (!hex) continue
      const style: ColorStyle = { id: this.newId(), name, value: hex }
      this.styles.push(style)
      this.styleByVar.set(name, style)
    }
  }

  /** Valeur d'une variable pour un thème (les variables qui renvoient à une autre sont suivies). */
  private resolveVar(name: string, theme: Theme, depth = 0): unknown {
    const v = this.vars.get(name)
    if (!v || depth > 16) return undefined
    let value = v.value
    if (Array.isArray(value)) {
      let best: unknown = undefined
      let bestScore = -1
      for (const e of value) {
        if (!isObj(e)) continue
        const t = isObj(e.theme) ? e.theme : {}
        const keys = Object.keys(t)
        if (!keys.every((k) => theme[k] === t[k])) continue
        if (keys.length >= bestScore) {
          best = e.value
          bestScore = keys.length
        }
      }
      value = bestScore >= 0 ? best : isObj(value[0]) ? value[0].value : undefined
    }
    if (typeof value === 'string' && value.startsWith('$')) return this.resolveVar(value.slice(1), theme, depth + 1)
    return value
  }

  /** Valeur d'une propriété, variable résolue. */
  private val(v: unknown, ctx: Ctx): unknown {
    return typeof v === 'string' && v.startsWith('$') ? this.resolveVar(v.slice(1), ctx.theme) : v
  }

  private num(v: unknown, ctx: Ctx, dflt: number): number {
    const x = this.val(v, ctx)
    if (isNum(x)) return x
    if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x)
    return dflt
  }

  private bool(v: unknown, ctx: Ctx, dflt: boolean): boolean {
    const x = this.val(v, ctx)
    return typeof x === 'boolean' ? x : dflt
  }

  private hex(v: unknown): string | null {
    return typeof v === 'string' ? normalizeColor(v) : null
  }

  /** Couleur Pen → couleur nommée (variable au thème par défaut) ou valeur en dur ; null si illisible. */
  private color(v: unknown, ctx: Ctx): Color | null {
    if (typeof v !== 'string') return null
    if (v.startsWith('$')) {
      const name = v.slice(1)
      const hex = this.hex(this.resolveVar(name, ctx.theme))
      const style = this.styleByVar.get(name)
      if (style && hex === style.value) return { style: style.id }
      return hex
    }
    return this.hex(v)
  }

  private hexOf(c: Color): string {
    return typeof c === 'string' ? c : (this.styles.find((s) => s.id === c.style)?.value ?? '#000000')
  }

  // ——— Calques ———

  private node(p: P, ctx: Ctx): Node | null {
    const type = p.type
    if (typeof type !== 'string') {
      this.report.add(R.unknownType)
      return null
    }
    if (NOTE_TYPES.has(type)) {
      this.report.add(R.notes)
      return null
    }
    if (SKIPPED_TYPES.has(type)) {
      this.report.add(R.scripts)
      return null
    }
    const theme = isObj(p.theme) ? { ...ctx.theme, ...(p.theme as Theme) } : ctx.theme
    const here: Ctx = theme === ctx.theme ? ctx : { ...ctx, theme }
    let out: Node | null
    switch (type) {
      case 'frame':
        out = this.frame(p, here)
        break
      case 'group':
        out = this.group(p, here)
        break
      case 'text':
        out = this.text(p, here)
        break
      case 'icon':
        out = this.icon(p, here)
        break
      case 'rectangle':
        out = this.shape(p, here, 'rectangle')
        break
      case 'ellipse':
        out = this.ellipse(p, here)
        break
      case 'polygon':
        out = this.polygon(p, here)
        break
      case 'path':
        out = this.path(p, here)
        break
      case 'line':
        out = this.line(p, here)
        break
      case 'ref':
        out = this.ref(p, here)
        break
      default:
        this.report.add(R.unknownType)
        return null
    }
    if (out) {
      this.converted.set(p, out)
      // Instance : le calque reste rattaché à l'arbre déplié (pas au `ref`).
      if (!this.penOf.has(out)) this.penOf.set(out, p)
    }
    return out
  }

  /** Propriétés communes : nom, visibilité, opacité, position. */
  private base(p: P, ctx: Ctx, dflt: string) {
    if (this.num(p.rotation, ctx, 0) % 360 !== 0) this.report.add(R.rotation)
    if (this.bool(p.flipX, ctx, false) || this.bool(p.flipY, ctx, false)) this.report.add(R.flip)
    const inFlow = this.inFlow(p, ctx)
    const out = {
      id: this.idFor(p),
      name: typeof p.name === 'string' && p.name ? p.name : dflt,
      visible: this.bool(p.enabled, ctx, true),
      locked: false,
      opacity: Math.max(0, Math.min(1, this.num(p.opacity, ctx, 1))),
      position: (ctx.parent?.auto && !inFlow ? 'absolute' : 'flow') as 'flow' | 'absolute',
    }
    return inFlow ? out : { ...out, x: round2(this.num(p.x, ctx, 0)), y: round2(this.num(p.y, ctx, 0)) }
  }

  private inFlow(p: P, ctx: Ctx): boolean {
    return !!ctx.parent?.auto && p.layoutPosition !== 'absolute'
  }

  /** Taille Pen lue : nombre, fill/fit avec repli éventuel. */
  private sizeSpec(p: P, axis: 'width' | 'height', ctx: Ctx): { kind: 'num'; n: number } | { kind: 'fill' | 'fit'; fb?: number } | null {
    const v = this.val(p[axis], ctx)
    if (isNum(v)) return { kind: 'num', n: Math.max(0, v) }
    if (typeof v !== 'string') return null
    const m = /^\s*(fill_container|fit_content)\s*(?:\(\s*(-?\d*\.?\d+)\s*\))?\s*$/.exec(v)
    if (!m) return null
    const kind = m[1] === 'fill_container' ? 'fill' : 'fit'
    return m[2] !== undefined ? { kind, fb: Math.max(0, Number(m[2])) } : { kind }
  }

  /** Taille Maquette d'un axe : fill seulement en flux d'un cadre automatique, hug seulement si permis. */
  private size(p: P, axis: 'width' | 'height', ctx: Ctx, canHug: boolean, dflt: 'fit' | 'num'): Size {
    const spec = this.sizeSpec(p, axis, ctx) ?? (dflt === 'fit' ? { kind: 'fit' as const } : null)
    if (spec?.kind === 'num') return round2(spec.n)
    if (spec?.kind === 'fill' && this.inFlow(p, ctx)) return FILL
    if (spec?.kind === 'fit' && canHug) return HUG
    return round2(spec && 'fb' in spec && spec.fb !== undefined ? spec.fb : this.estimate(p, axis, ctx))
  }

  /** Taille approchée d'un calque Pen (repli quand fill/fit n'ont pas de sens), en px. */
  private estimate(p: P, axis: 'width' | 'height', ctx: Ctx, depth = 0): number {
    const spec = this.sizeSpec(p, axis, ctx)
    if (spec?.kind === 'num') return spec.n
    if (spec && 'fb' in spec && spec.fb !== undefined) return spec.fb
    if (depth > 30) return 0
    if (p.type === 'ref') {
      const comp = typeof p.ref === 'string' ? this.reusable.get(p.ref) : undefined
      if (!comp) return 100
      const merged = { ...comp, ...p, type: comp.type, ref: comp.ref, children: comp.children }
      return this.estimate(merged, axis, ctx, depth + 1)
    }
    if (p.type === 'text') {
      const content = String(this.val(p.content, ctx) ?? '')
      const size = this.num(p.fontSize, ctx, 14)
      const lines = content.split('\n')
      if (axis === 'width') return Math.ceil(Math.max(...lines.map((l) => l.length)) * size * 0.55)
      const lh = this.num(p.lineHeight, ctx, 0)
      return Math.ceil(lines.length * size * (lh > 0 ? lh : 1.2))
    }
    const kids = asList(p.children).filter(isObj).filter((c) => !NOTE_TYPES.has(String(c.type)) && this.bool(c.enabled, ctx, true))
    if (!kids.length) return p.type === 'frame' || p.type === 'group' ? 0 : 24
    const layout = p.type === 'frame' ? String(this.val(p.layout, ctx) ?? 'horizontal') : 'none'
    if (layout === 'none') {
      const key = axis === 'width' ? 'x' : 'y'
      return Math.max(0, ...kids.map((c) => this.num(c[key], ctx, 0) + this.estimate(c, axis, ctx, depth + 1)))
    }
    const pad = this.padding(p, ctx)
    const flow = kids.filter((c) => c.layoutPosition !== 'absolute')
    const sizes = flow.map((c) => this.estimate(c, axis, ctx, depth + 1))
    const main = (layout === 'vertical') === (axis === 'height')
    const inner = main ? sizes.reduce((a, b) => a + b, 0) + this.num(p.gap, ctx, 0) * Math.max(0, flow.length - 1) : Math.max(0, ...sizes)
    return inner + (axis === 'width' ? pad[1] + pad[3] : pad[0] + pad[2])
  }

  private padding(p: P, ctx: Ctx): [number, number, number, number] {
    const v = this.val(p.padding, ctx)
    const n = (x: unknown) => Math.max(0, this.num(x, ctx, 0))
    if (Array.isArray(v)) {
      if (v.length === 2) return [n(v[0]), n(v[1]), n(v[0]), n(v[1])]
      if (v.length === 4) return [n(v[0]), n(v[1]), n(v[2]), n(v[3])]
      if (v.length === 1) return [n(v[0]), n(v[0]), n(v[0]), n(v[0])]
      return [0, 0, 0, 0]
    }
    const all = n(v)
    return [all, all, all, all]
  }

  private radius(p: P, ctx: Ctx): Radius {
    const v = this.val(p.cornerRadius, ctx)
    if (Array.isArray(v) && v.length === 4) {
      const r = v.map((x) => round2(Math.max(0, this.num(x, ctx, 0)))) as [number, number, number, number]
      return r.every((x) => x === r[0]) ? r[0] : r
    }
    return round2(Math.max(0, this.num(v, ctx, 0)))
  }

  // ——— Remplissages, contours, effets ———

  /** Pile de remplissages Pen → remplissages Maquette (dans l'ordre, le dernier au-dessus). */
  private fills(p: P, ctx: Ctx, w: number, h: number, allowImage = true): Fill[] {
    const out: Fill[] = []
    for (const f of asList(p.fill)) {
      const fill = this.fill(f, ctx, w, h)
      if (!fill) continue
      if (typeof fill === 'object' && 'type' in fill && fill.type === 'image' && !allowImage) {
        this.report.add(R.vectorImage)
        continue
      }
      out.push(fill)
    }
    return out
  }

  private fill(f: unknown, ctx: Ctx, w: number, h: number): Fill | null {
    if (typeof f === 'string') return this.color(f, ctx)
    if (!isObj(f)) return null
    if (!this.bool(f.enabled, ctx, true)) return null
    if (typeof f.blendMode === 'string' && f.blendMode !== 'normal') this.report.add(R.blendMode)
    switch (f.type) {
      case 'color':
        return this.color(f.color, ctx)
      case 'gradient':
        return this.gradient(f, ctx, w, h)
      case 'image': {
        const url = typeof f.url === 'string' ? f.url : ''
        const src = url && this.options.image ? this.options.image(url) : null
        if (!src) this.report.add(R.imageMissing)
        if (Array.isArray(f.transform) && !isIdentity(f.transform)) this.report.add(R.imageCrop)
        if (this.num(f.opacity, ctx, 1) < 1) this.report.add(R.imageOpacity)
        const mode = String(f.mode ?? 'cover')
        return { type: 'image', src: src ?? '', fit: mode === 'contain' ? 'contain' : mode === 'stretch' ? 'fill' : 'cover' }
      }
      case 'mesh_gradient': {
        this.report.add(R.mesh)
        const colors = asList(f.colors).map((c) => this.color(c, ctx)).filter((c): c is Color => c !== null).map((c) => this.hexOf(c))
        return colors.length ? averageHex(colors) : null
      }
      case 'shader':
        this.report.add(R.shaders)
        return null
      default:
        return null
    }
  }

  private gradient(f: P, ctx: Ctx, w: number, h: number): Paint | null {
    const opacity = Math.max(0, Math.min(1, this.num(f.opacity, ctx, 1)))
    const stops: PenStop[] = []
    for (const s of asList(f.colors)) {
      if (!isObj(s)) continue
      let color = this.color(s.color, ctx)
      if (!color) continue
      let hex = this.hexOf(color)
      if (opacity < 1) {
        hex = withAlpha(hex, opacity)
        color = hex
      }
      stops.push({ color, hex, position: this.num(s.position, ctx, 0) })
    }
    if (!stops.length) return null
    const center = isObj(f.center) ? f.center : {}
    const size = isObj(f.size) ? f.size : {}
    const g: PenGradientGeometry = {
      rotation: this.num(f.rotation, ctx, 0),
      center: { x: this.num(center.x, ctx, 0.5), y: this.num(center.y, ctx, 0.5) },
      size: { width: this.num(size.width, ctx, 1), height: this.num(size.height, ctx, 1) },
    }
    const kind = String(f.gradientType ?? 'linear')
    if (kind === 'radial') {
      const r = penRadial(stops, g, w, h)
      if (r.offCenter) this.report.add(R.radialOffCenter)
      return r.gradient
    }
    if (kind === 'angular') {
      const r = penConic(stops, g)
      if (r.offCenter) this.report.add(R.conicOffCenter)
      return r.gradient
    }
    return penLinear(stops, g, w, h)
  }

  /** Première couleur d'une pile Pen (texte, icône, contour) ; un dégradé donne sa première couleur. */
  private firstColor(v: unknown, ctx: Ctx, onGradient: () => void, onImage?: () => void): Color | null {
    for (const f of asList(v)) {
      if (typeof f === 'string') {
        const c = this.color(f, ctx)
        if (c) return c
        continue
      }
      if (!isObj(f) || !this.bool(f.enabled, ctx, true)) continue
      if (f.type === 'color') {
        const c = this.color(f.color, ctx)
        if (c) return c
      } else if (f.type === 'gradient') {
        const first = asList(f.colors).find(isObj)
        const c = first ? this.color(first.color, ctx) : null
        if (c) {
          onGradient()
          return c
        }
      } else if (f.type === 'image') onImage?.()
      else if (f.type === 'shader') this.report.add(R.shaders)
    }
    return null
  }

  /**
   * Contour Pen → contour Maquette ; un contour sur certains côtés seulement devient des ombres
   * pleines (sans flou) sur ces côtés.
   */
  private stroke(p: P, ctx: Ctx, sides: boolean): { stroke?: Stroke; shadows: Shadow[] } {
    if (p.stroke === undefined) return { shadows: [] }
    const color = this.firstColor(p.stroke, ctx, () => this.report.add(R.gradientStroke), () => this.report.add(R.imageStroke))
    if (!color) return { shadows: [] }
    const alignRaw = String(p.strokeAlignment ?? 'center')
    const align: Stroke['align'] = alignRaw === 'inner' ? 'inside' : alignRaw === 'outer' ? 'outside' : 'center'
    const wv = this.val(p.strokeWidth, ctx)
    if (isObj(wv)) {
      const s = ['top', 'right', 'bottom', 'left'].map((k) => Math.max(0, this.num(wv[k], ctx, 0))) as [number, number, number, number]
      if (s.every((x) => x === s[0])) return s[0] > 0 ? { stroke: { color, width: s[0], align }, shadows: [] } : { shadows: [] }
      const max = Math.max(...s)
      if (max <= 0) return { shadows: [] }
      if (!sides) return { stroke: { color, width: max, align }, shadows: [] }
      this.report.add(R.sideStroke)
      // Intérieur (ou centré) : ombre intérieure décalée vers le côté ; extérieur : ombre externe.
      const inset = align !== 'outside'
      const k = inset ? -1 : 1
      const shadows: Shadow[] = []
      const [top, right, bottom, left] = s
      if (top > 0) shadows.push({ x: 0, y: -k * top, blur: 0, spread: 0, color, inset })
      if (right > 0) shadows.push({ x: k * right, y: 0, blur: 0, spread: 0, color, inset })
      if (bottom > 0) shadows.push({ x: 0, y: k * bottom, blur: 0, spread: 0, color, inset })
      if (left > 0) shadows.push({ x: -k * left, y: 0, blur: 0, spread: 0, color, inset })
      return { shadows }
    }
    // Sans strokeWidth, Pen ne dessine pas le contour.
    const width = Math.max(0, this.num(wv, ctx, 0))
    return width > 0 ? { stroke: { color, width: round2(width), align }, shadows: [] } : { shadows: [] }
  }

  /** Effets Pen → ombres et flous (flou Pen = 2 × l'écart-type, comme l'export CSS de Pen). */
  private effects(p: P, ctx: Ctx): { shadows: Shadow[]; blur?: number; backgroundBlur?: number } {
    const shadows: Shadow[] = []
    let blur = 0
    let backgroundBlur = 0
    for (const e of asList(p.effect)) {
      if (!isObj(e) || !this.bool(e.enabled, ctx, true)) continue
      if (e.type === 'shadow') {
        const offset = isObj(e.offset) ? e.offset : {}
        const color = this.color(e.color ?? '#000000', ctx) ?? '#000000'
        shadows.push({
          x: round2(this.num(offset.x, ctx, 0)),
          y: round2(this.num(offset.y, ctx, 0)),
          blur: round2(Math.max(0, this.num(e.blur, ctx, 0))),
          spread: round2(this.num(e.spread, ctx, 0)),
          color,
          inset: e.shadowType === 'inner',
        })
        if (typeof e.blendMode === 'string' && e.blendMode !== 'normal') this.report.add(R.blendMode)
      } else if (e.type === 'blur') blur = Math.max(blur, this.num(e.radius, ctx, 0) / 2)
      else if (e.type === 'background_blur') backgroundBlur = Math.max(backgroundBlur, this.num(e.radius, ctx, 0) / 2)
      else if (e.type === 'shader') this.report.add(R.shaders)
    }
    return {
      shadows,
      ...(blur > 0 ? { blur: round2(blur) } : {}),
      ...(backgroundBlur > 0 ? { backgroundBlur: round2(backgroundBlur) } : {}),
    }
  }

  private dims(p: P, ctx: Ctx): { w: number; h: number } {
    return { w: this.estimate(p, 'width', ctx), h: this.estimate(p, 'height', ctx) }
  }

  // ——— Types de calques ———

  private frame(p: P, ctx: Ctx): FrameNode {
    const layoutRaw = String(this.val(p.layout, ctx) ?? 'horizontal')
    const auto = layoutRaw !== 'none'
    const dir = layoutRaw === 'vertical' ? 'column' : 'row'
    const base = this.base(p, ctx, 'Frame')
    const { w, h } = this.dims(p, ctx)
    const fx = this.effects(p, ctx)
    const st = this.stroke(p, ctx, true)
    const childCtx: Ctx = { theme: ctx.theme, parent: { auto, dir } }
    const children = asList(p.children).filter(isObj).map((c) => this.node(c, childCtx)).filter((n): n is Node => n !== null)
    const layout: FrameNode['layout'] = auto
      ? {
        mode: 'auto', direction: dir, gap: round2(this.num(p.gap, ctx, 0)), padding: this.padding(p, ctx),
        justify: JUSTIFY[String(p.justifyContent)] ?? 'start', align: ALIGN[String(p.alignItems)] ?? 'start',
        wrap: false, reverseZ: false,
      } satisfies AutoLayout
      : { mode: 'free' }
    const node: FrameNode = {
      ...base,
      type: 'frame',
      width: this.size(p, 'width', ctx, auto, 'fit'),
      height: this.size(p, 'height', ctx, auto, 'fit'),
      children,
      layout,
      fills: this.fills(p, ctx, w, h),
      ...(st.stroke ? { stroke: st.stroke } : {}),
      radius: this.radius(p, ctx),
      shadows: [...st.shadows, ...fx.shadows],
      clip: this.bool(p.clip, ctx, false),
      ...(fx.blur ? { blur: fx.blur } : {}),
      ...(fx.backgroundBlur ? { backgroundBlur: fx.backgroundBlur } : {}),
    }
    if (p.reusable === true && !this.meta.has(p) && typeof p.id === 'string') {
      node.component = true
      this.mainPen.set(p.id, p)
    }
    this.fixHugConflicts(node, ctx)
    return node
  }

  /**
   * Un cadre en hug ne peut pas contenir d'enfant en fill sur le même axe (règle du modèle) ; Pen
   * l'admet (l'enfant prend la place que les autres laissent). Axe secondaire : l'enfant suit son
   * contenu et s'étire (alignSelf stretch) ; sinon il reçoit une taille fixe approchée.
   */
  private fixHugConflicts(node: FrameNode, ctx: Ctx): void {
    if (node.layout.mode !== 'auto') return
    const dir = node.layout.direction
    for (const axis of ['width', 'height'] as const) {
      if (!(typeof node[axis] === 'object' && (node[axis] as { mode: string }).mode === 'hug')) continue
      const main = (dir === 'row') === (axis === 'width')
      for (const c of node.children) {
        const s = c[axis]
        if (c.position !== 'flow' || !(typeof s === 'object' && s.mode === 'fill')) continue
        const autoChild = c.type === 'frame' && c.layout.mode === 'auto'
        const pen = this.penOf.get(c)
        if (autoChild) {
          c[axis] = HUG
          if (!main) c.alignSelf = 'stretch'
        } else c[axis] = round2(pen ? this.estimate(pen, axis, ctx) : 100)
      }
    }
  }

  private group(p: P, ctx: Ctx): FrameNode {
    const base = this.base(p, ctx, 'Group')
    const fx = this.effects(p, ctx)
    const childCtx: Ctx = { theme: ctx.theme, parent: { auto: false, dir: 'row' } }
    const kids = asList(p.children).filter(isObj)
    const children: Node[] = []
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const k of kids) {
      const n = this.node(k, childCtx)
      if (!n) continue
      children.push(n)
      const x = n.x ?? 0
      const y = n.y ?? 0
      const w = typeof n.width === 'number' ? n.width : this.estimate(k, 'width', ctx)
      const h = typeof n.height === 'number' ? n.height : this.estimate(k, 'height', ctx)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + w)
      maxY = Math.max(maxY, y + h)
    }
    if (!children.length) minX = minY = maxX = maxY = 0
    // Le cadre épouse ses enfants : ils sont décalés d'autant.
    for (const c of children) {
      c.x = round2((c.x ?? 0) - minX)
      c.y = round2((c.y ?? 0) - minY)
    }
    const at = 'x' in base ? { x: round2(base.x + minX), y: round2(base.y + minY) } : {}
    return {
      ...base,
      ...at,
      type: 'frame',
      width: round2(maxX - minX),
      height: round2(maxY - minY),
      children,
      layout: { mode: 'free' },
      fills: [],
      radius: 0,
      shadows: fx.shadows,
      clip: false,
      ...(fx.blur ? { blur: fx.blur } : {}),
      ...(fx.backgroundBlur ? { backgroundBlur: fx.backgroundBlur } : {}),
    }
  }

  private text(p: P, ctx: Ctx): TextNode {
    const base = this.base(p, ctx, 'Text')
    const family = String(this.val(p.fontFamily, ctx) ?? 'Inter') || 'Inter'
    const fontSize = Math.max(0.5, this.num(p.fontSize, ctx, 14))
    const lhRatio = this.num(p.lineHeight, ctx, 0)
    const lineHeight = Math.max(1, Math.round((lhRatio > 0 ? lhRatio : autoLineHeight(family)) * fontSize))
    const weightRaw = this.val(p.fontWeight, ctx)
    let fontWeight = 400
    if (isNum(weightRaw)) fontWeight = weightRaw
    else if (typeof weightRaw === 'string') {
      const key = weightRaw.trim().toLowerCase().replace(/[\s_-]/g, '')
      fontWeight = /^\d+$/.test(key) ? Number(key) : (FONT_WEIGHTS[key] ?? 400)
    }
    fontWeight = Math.max(1, Math.min(1000, Math.round(fontWeight)))
    const style = String(this.val(p.fontStyle, ctx) ?? 'normal').toLowerCase()
    const growth = String(p.textGrowth ?? 'auto')
    const textSizing: TextNode['textSizing'] = growth === 'fixed-width' ? 'auto-height' : growth === 'fixed-width-height' ? 'fixed' : 'auto'
    let width: Size = HUG
    let height: Size = HUG
    if (textSizing !== 'auto') {
      width = this.size(p, 'width', ctx, false, 'num')
      height = textSizing === 'fixed' ? this.size(p, 'height', ctx, false, 'num') : HUG
    }
    const valign = String(p.textAlignVertical ?? 'top')
    if (textSizing === 'fixed' && valign !== 'top') this.report.add(R.textVertical)
    if (this.bool(p.underline, ctx, false) || this.bool(p.strikethrough, ctx, false)) this.report.add(R.textDecoration)
    if (p.stroke !== undefined) this.report.add(R.textStroke)
    if (asList(p.effect).length) this.report.add(R.textEffects)
    const color = this.firstColor(p.fill, ctx, () => this.report.add(R.textGradient)) ?? '#000000'
    const align = String(p.textAlign ?? 'left')
    const content = this.val(p.content, ctx)
    return {
      ...base,
      type: 'text',
      width,
      height,
      content: typeof content === 'string' ? content : content === undefined ? '' : String(content),
      fontFamily: family,
      fontWeight,
      fontStyle: style === 'italic' || style === 'oblique' ? 'italic' : 'normal',
      fontSize: round2(fontSize),
      lineHeight,
      letterSpacing: round2(this.num(p.letterSpacing, ctx, 0)),
      textAlign: align === 'center' || align === 'right' || align === 'justify' ? align : 'left',
      color,
      textSizing,
    }
  }

  private icon(p: P, ctx: Ctx): IconNode | ShapeNode {
    const base = this.base(p, ctx, 'Icon')
    const width = this.size(p, 'width', ctx, false, 'num')
    const height = this.size(p, 'height', ctx, false, 'num')
    if (asList(p.effect).length) this.report.add(R.textEffects)
    const library = String(this.val(p.library, ctx) ?? 'lucide')
    const weight = this.val(p.weight, ctx)
    let found = penIconSet(library, isNum(weight) ? weight : undefined)
    if (!found && /material/i.test(library)) {
      // Material Outlined, Sharp : mêmes noms, dessinés avec le jeu Rounded.
      this.report.add(R.iconMaterialStyle)
      found = penIconSet('Material Symbols Rounded', isNum(weight) ? weight : undefined)
    }
    const color = this.firstColor(p.fill, ctx, () => this.report.add(R.textGradient)) ?? '#000000'
    if (!found) {
      this.report.add(R.iconSetUnknown)
      return { ...base, type: 'shape', shape: 'rectangle', width, height, fills: ['#D9D9D9'], radius: 2, shadows: [] }
    }
    const raw = String(this.val(p.icon, ctx) ?? '')
    let name = raw ? resolveIconIn(found.set, raw) : null
    if (!name && found.set === 'lucide' && raw) {
      // Logos de marques retirés de Lucide (facebook, instagram…) : ceux de Phosphor.
      const logo = resolveIconIn('phosphor', `${raw}-logo`)
      if (logo) {
        this.report.add(R.iconBrand)
        found = { set: 'phosphor' }
        name = logo
      }
    }
    if (!name) this.report.add(R.iconNotFound)
    return {
      ...base,
      type: 'icon',
      width,
      height,
      icon: name ?? (raw || 'circle'),
      set: found.set,
      ...(found.weight !== undefined ? { weight: found.weight } : {}),
      color,
      strokeWidth: 2,
    }
  }

  private shape(p: P, ctx: Ctx, shape: 'rectangle' | 'ellipse'): ShapeNode {
    const base = this.base(p, ctx, shape === 'ellipse' ? 'Ellipse' : 'Rectangle')
    const { w, h } = this.dims(p, ctx)
    const fx = this.effects(p, ctx)
    const st = this.stroke(p, ctx, shape === 'rectangle')
    return {
      ...base,
      type: 'shape',
      shape,
      width: this.size(p, 'width', ctx, false, 'num'),
      height: this.size(p, 'height', ctx, false, 'num'),
      fills: this.fills(p, ctx, w, h),
      ...(st.stroke ? { stroke: st.stroke } : {}),
      radius: shape === 'ellipse' ? 0 : this.radius(p, ctx),
      shadows: [...st.shadows, ...fx.shadows],
      ...(fx.blur ? { blur: fx.blur } : {}),
      ...(fx.backgroundBlur ? { backgroundBlur: fx.backgroundBlur } : {}),
    }
  }

  private ellipse(p: P, ctx: Ctx): ShapeNode | VectorNode {
    const inner = this.num(p.innerRadius, ctx, 0)
    const sweep = this.num(p.sweepAngle, ctx, 360)
    if (inner <= 0 && Math.abs(sweep) >= 360) return this.shape(p, ctx, 'ellipse')
    const { w, h } = this.dims(p, ctx)
    const arc = arcPath(Math.max(w, 1), Math.max(h, 1), inner, this.num(p.startAngle, ctx, 0), sweep)
    return this.vector(p, ctx, 'Ellipse', arc.path, [0, 0, Math.max(w, 1), Math.max(h, 1)], arc.fillRule)
  }

  private polygon(p: P, ctx: Ctx): VectorNode {
    const { w, h } = this.dims(p, ctx)
    if (this.num(p.cornerRadius, ctx, 0) > 0) this.report.add(R.polygonRadius)
    const W = Math.max(w, 1)
    const H = Math.max(h, 1)
    return this.vector(p, ctx, 'Polygon', polygonPath(W, H, this.num(p.polygonCount, ctx, 3)), [0, 0, W, H], 'nonzero')
  }

  private path(p: P, ctx: Ctx): VectorNode | null {
    const d = typeof p.geometry === 'string' ? p.geometry.trim() : ''
    if (!d || !isValidPath(d)) {
      this.report.add(R.unknownType)
      return null
    }
    const vb = Array.isArray(p.viewBox) && p.viewBox.length === 4 && p.viewBox.every(isNum)
      ? (p.viewBox as [number, number, number, number])
      : pathBounds(d)!
    const viewBox: [number, number, number, number] = [vb[0], vb[1], vb[2] > 0 ? vb[2] : 1, vb[3] > 0 ? vb[3] : 1]
    return this.vector(p, ctx, 'Path', d, viewBox, p.fillRule === 'evenodd' ? 'evenodd' : 'nonzero')
  }

  private vector(p: P, ctx: Ctx, dflt: string, path: string, viewBox: [number, number, number, number], fillRule: 'nonzero' | 'evenodd'): VectorNode {
    const base = this.base(p, ctx, dflt)
    const { w, h } = this.dims(p, ctx)
    const fx = this.effects(p, ctx)
    const st = this.stroke(p, ctx, false)
    return {
      ...base,
      type: 'vector',
      width: this.size(p, 'width', ctx, false, 'num'),
      height: this.size(p, 'height', ctx, false, 'num'),
      path,
      viewBox,
      fillRule,
      fills: this.fills(p, ctx, w, h, false) as Paint[],
      ...(st.stroke ? { stroke: st.stroke } : {}),
      shadows: fx.shadows,
      ...(fx.blur ? { blur: fx.blur } : {}),
      ...(fx.backgroundBlur ? { backgroundBlur: fx.backgroundBlur } : {}),
    }
  }

  /** Ligne Pen (type hors schéma) : un rectangle de l'épaisseur du trait, de sa couleur. */
  private line(p: P, ctx: Ctx): ShapeNode {
    const base = this.base(p, ctx, 'Line')
    const color = this.firstColor(p.stroke, ctx, () => this.report.add(R.gradientStroke)) ?? '#000000'
    const t = Math.max(1, this.num(p.strokeWidth, ctx, 1))
    const w = this.size(p, 'width', ctx, false, 'num')
    const hSpec = this.sizeSpec(p, 'height', ctx)
    const vertical = hSpec?.kind === 'num' && hSpec.n > 0 && this.sizeSpec(p, 'width', ctx)?.kind === 'num' && (this.sizeSpec(p, 'width', ctx) as { n: number }).n === 0
    return {
      ...base,
      type: 'shape',
      shape: 'rectangle',
      width: vertical ? t : w,
      height: vertical ? this.size(p, 'height', ctx, false, 'num') : t,
      fills: [color],
      radius: 0,
      shadows: [],
    }
  }

  // ——— Composants ———

  /** Instance Pen (`ref`) : composant déplié, puis converti comme un calque ordinaire. */
  private ref(p: P, ctx: Ctx): Node | null {
    const tree = this.expand(p, [])
    if (!tree) {
      // Composant introuvable ou boucle : un cadre vide à la taille donnée.
      const base = this.base(p, ctx, 'Instance')
      return {
        ...base, type: 'frame', width: round2(this.estimate(p, 'width', ctx)), height: round2(this.estimate(p, 'height', ctx)),
        children: [], layout: { mode: 'free' }, fills: [], radius: 0, shadows: [], clip: false,
      }
    }
    const m = this.meta.get(tree)!
    const original = !this.meta.has(p) && typeof p.id === 'string'
    if (original) m.refId = p.id as string
    if (original && p.reusable === true) {
      // Variante : composant indépendant (son contenu n'est relié à rien).
      m.variant = true
      this.report.add(R.variant)
    }
    const out = this.node(tree, ctx)
    // La racine de l'instance garde l'id du `ref` quand il est libre.
    const id = typeof p.id === 'string' ? p.id : ''
    if (out && original && VALID_ID.test(id) && !this.used.has(id)) {
      this.used.delete(out.id)
      out.id = id
      this.used.add(id)
    }
    if (out && m.variant && out.type === 'frame') {
      out.component = true
      this.mainPen.set(id, tree)
    }
    return out
  }

  /**
   * Copie Pen d'un sous-arbre déplié dans une instance. Chaque calque reçoit son chemin d'ids
   * (`prefix` + id) ; une instance imbriquée est dépliée et ses chemins préfixés par son id.
   */
  private copyTree(node: P, prefix: string, stack: string[]): P {
    if (node.type === 'ref') {
      const id = String(node.id)
      const sub = this.expand(node, stack)
      if (!sub) {
        const empty: P = { ...structuredClone(node), type: 'frame', children: [], layout: 'none' }
        delete empty.ref
        delete empty.descendants
        this.meta.set(empty, { path: prefix + id })
        return empty
      }
      walkPen(sub, (n) => {
        const m = this.meta.get(n)
        if (!m) return
        m.path = n === sub ? prefix + id : `${prefix}${id}/${m.path}`
        if (n === sub) delete m.root
      })
      return sub
    }
    const { children, ...rest } = node
    const copy: P = structuredClone(rest)
    this.meta.set(copy, { path: prefix + String(node.id) })
    if (Array.isArray(children)) copy.children = children.filter(isObj).map((c) => this.copyTree(c, prefix, stack))
    return copy
  }

  /**
   * Déplie une instance Pen : copie du composant (lui-même éventuellement une instance : variante),
   * surcharges de la racine, puis `descendants` (surcharge par chemin d'ids ou nom unique, remplacement
   * si `type`, enfants de slot). null si le composant manque ou se contient lui-même.
   */
  private expand(ref: P, stack: string[]): P | null {
    const compId = typeof ref.ref === 'string' ? ref.ref : ''
    const comp = this.reusable.get(compId)
    if (!comp) {
      this.report.add(R.missingComponent)
      return null
    }
    if (stack.includes(compId)) {
      this.report.add(R.componentCycle)
      return null
    }
    const inner = [...stack, compId]
    let tree: P
    if (comp.type === 'ref') {
      // Variante d'un composant : l'arbre déplié de la variante (chemins de son composant), repris tel quel.
      const sub = this.expand(comp, inner)
      if (!sub) return null
      tree = sub
    } else {
      const { children, ...rest } = comp
      tree = structuredClone(rest)
      this.meta.set(tree, { path: '' })
      if (Array.isArray(children)) tree.children = children.filter(isObj).map((c) => this.copyTree(c, '', inner))
    }
    delete tree.reusable
    const m = this.meta.get(tree)!
    Object.assign(m, { path: '', instanceOf: compId, root: true })
    for (const [k, v] of Object.entries(ref)) {
      if (k === 'type' || k === 'ref' || k === 'descendants' || k === 'reusable' || k === 'children') continue
      tree[k] = structuredClone(v)
    }
    const queue: [string, unknown][] = isObj(ref.descendants) ? Object.entries(ref.descendants) : []
    while (queue.length) {
      const [key, d] = queue.shift()!
      if (!isObj(d)) continue
      const target = this.findPath(tree, key)
      if (!target) {
        this.report.add(R.descendantNotFound)
        continue
      }
      const tm = this.meta.get(target.node)!
      // Calques ajoutés (slot, remplacement) : adressables par leur id, au niveau du calque visé.
      const prefix = tm.path.includes('/') ? tm.path.slice(0, tm.path.lastIndexOf('/') + 1) : ''
      if (typeof d.type === 'string') {
        // Remplacement complet : le nouveau sous-arbre prend la place (et le chemin) de l'ancien.
        const repl = this.copyTree(d, prefix, inner)
        const rm = this.meta.get(repl)!
        rm.path = tm.path
        rm.replaced = true
        if (target.parent) {
          const kids = target.parent.children as P[]
          kids[kids.indexOf(target.node)] = repl
        }
        continue
      }
      for (const [k, v] of Object.entries(d)) {
        if (k === 'children') {
          target.node.children = asList(v).filter(isObj).map((c) => this.copyTree(c, prefix, inner))
          tm.localChildren = true
        } else if (k === 'descendants' && isObj(v)) {
          for (const [k2, d2] of Object.entries(v)) queue.push([`${tm.path}/${k2}`, d2])
        } else if (k !== 'id' && k !== 'type' && k !== 'ref') target.node[k] = structuredClone(v)
      }
    }
    return tree
  }

  /** Calque d'une instance dépliée désigné par un chemin d'ids (ou, à défaut, par un nom unique). */
  private findPath(tree: P, key: string): { node: P; parent: P | null } | null {
    let found: { node: P; parent: P | null } | null = null
    const byName: { node: P; parent: P | null }[] = []
    const visit = (n: P, parent: P | null) => {
      if (n !== tree) {
        if (this.meta.get(n)?.path === key && !found) found = { node: n, parent }
        if (n.name === key) byName.push({ node: n, parent })
      }
      for (const c of asList(n.children)) if (isObj(c)) visit(c, n)
    }
    visit(tree, null)
    return found ?? (byName.length === 1 ? byName[0]! : null)
  }

  private mainNode(compId: string | undefined): FrameNode | null {
    const pen = compId === undefined ? undefined : this.mainPen.get(compId)
    const n = pen ? this.converted.get(pen) : undefined
    return n?.type === 'frame' && n.component ? n : null
  }

  /** Calques d'un principal par chemin d'ids Pen (ceux des instances qu'il contient : « instance/calque »). */
  private pathsOf(compId: string): Map<string, Node> {
    const cached = this.pathCache.get(compId)
    if (cached) return cached
    const out = new Map<string, Node>()
    const root = this.mainNode(compId)!
    const visit = (n: Node, prefix: string) => {
      const pen = this.penOf.get(n)
      const m = pen ? this.meta.get(pen) : undefined
      let childPrefix = prefix
      if (n !== root && pen) {
        let key: string | null = null
        if (m?.root && m.refId) {
          // Instance posée dans le principal : ses calques sont adressés sous son id.
          key = prefix + m.refId
          childPrefix = `${key}/`
        } else if (m) key = prefix + m.path
        else if (typeof pen.id === 'string') key = prefix + pen.id
        if (key !== null && !out.has(key)) out.set(key, n)
      }
      if (n.type === 'frame') for (const c of n.children) visit(c, childPrefix)
    }
    visit(root, '')
    this.pathCache.set(compId, out)
    return out
  }

  /**
   * Relie les instances converties à leurs principaux, de haut en bas : `instanceOf` des racines,
   * `source` de chaque copie (même chemin d'ids dans le principal), `overrides` = propriétés qui
   * diffèrent. Un calque sans correspondant reste local ; une instance imbriquée sans correspondant
   * devient une instance à part entière.
   */
  private link(top: Node[]): void {
    interface Scope { paths: Map<string, Node>; base: string; used: Set<string> }
    const rootOf = (n: FrameNode, compId: string, base: string): Scope | null => {
      const main = this.mainNode(compId)
      if (!main) return null
      n.instanceOf = main.id
      this.setOverrides(n, main, true, false)
      return { paths: this.pathsOf(compId), base, used: new Set() }
    }
    const visit = (n: Node, scope: Scope | null): void => {
      const pen = this.penOf.get(n)
      const m = pen ? this.meta.get(pen) : undefined
      const kids = n.type === 'frame' ? n.children : []
      if (!m || m.variant) {
        kids.forEach((c) => visit(c, null))
        return
      }
      if (m.root && n.type === 'frame' && m.instanceOf) {
        const inner = rootOf(n, m.instanceOf, '')
        kids.forEach((c) => visit(c, inner))
        return
      }
      if (scope && m.path.startsWith(scope.base)) {
        const cp = scope.paths.get(m.path.slice(scope.base.length))
        if (cp && !scope.used.has(cp.id)) {
          scope.used.add(cp.id)
          n.source = cp.id
          if (n.type === 'frame' && m.instanceOf && cp.type === 'frame' && cp.instanceOf !== undefined) n.instanceOf = cp.instanceOf
          // Remplacement : tout est local dessous.
          const replaced = !!m.replaced || n.type !== cp.type
          this.setOverrides(n, cp, false, replaced)
          kids.forEach((c) => visit(c, replaced ? null : scope))
          // Slot : les calques sans correspondant sont locaux, la liste d'enfants aussi.
          if (!replaced && m.localChildren && n.type === 'frame' && n.children.some((c) => c.source === undefined)) {
            n.overrides = [...new Set([...(n.overrides ?? []), CHILDREN_OVERRIDE])].sort()
          }
          return
        }
      }
      // Sans correspondant : instance imbriquée → instance à part entière ; sinon calque local.
      if (n.type === 'frame' && m.instanceOf) {
        const inner = rootOf(n, m.instanceOf, m.path ? `${m.path}/` : '')
        kids.forEach((c) => visit(c, inner))
        return
      }
      kids.forEach((c) => visit(c, null))
    }
    top.forEach((n) => visit(n, null))
  }

  private setOverrides(node: Node, main: Node, root: boolean, replaced: boolean): void {
    const bag = node as unknown as P
    const ref = main as unknown as P
    const keys = new Set<string>()
    if (replaced) {
      for (const k of Object.keys(bag)) if (!OWN.has(k) && !(root && ROOT_LOCAL_KEYS.has(k))) keys.add(k)
      if (node.type === 'frame') keys.add(CHILDREN_OVERRIDE)
    } else {
      for (const k of new Set([...Object.keys(bag), ...Object.keys(ref)])) {
        if (OWN.has(k) || (root && ROOT_LOCAL_KEYS.has(k))) continue
        if (!deepEqual(bag[k], ref[k])) keys.add(k)
      }
    }
    if (keys.size) node.overrides = [...keys].sort()
    else delete node.overrides
  }
}

function walkPen(n: P, visit: (n: P) => void): void {
  visit(n)
  for (const c of asList(n.children)) if (isObj(c)) walkPen(c, visit)
}

const isIdentity = (t: unknown[]): boolean => t.length === 6 && [1, 0, 0, 1, 0, 0].every((v, i) => t[i] === v)

function withAlpha(hex: string, k: number): string {
  const a = hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1
  const alpha = Math.round(a * k * 255)
  return alpha >= 255 ? hex.slice(0, 7) : hex.slice(0, 7) + alpha.toString(16).padStart(2, '0').toUpperCase()
}

function averageHex(list: string[]): string {
  const sum = [0, 0, 0, 0]
  for (const h of list) {
    const c = h.replace('#', '')
    for (let i = 0; i < 4; i++) sum[i]! += i < 3 || c.length >= 8 ? parseInt(c.slice(i * 2, i * 2 + 2), 16) : 255
  }
  const s = sum.map((v) => Math.round(v / list.length).toString(16).padStart(2, '0')).join('').toUpperCase()
  return `#${s.endsWith('FF') ? s.slice(0, 6) : s}`
}
