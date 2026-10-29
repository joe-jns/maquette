import { normalizeColor, normalizeColorValue } from './color'
import type { Color, Fill, Gradient, GradientStop, ImageFill } from './types'

/**
 * Remplissages : couleurs, dégradés et images. Lecture tolérante des formes courantes (CSS, Figma,
 * Pen), rendu CSS. Code pur.
 */

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const isImageFill = (f: Fill): f is ImageFill => typeof f === 'object' && 'type' in f && f.type === 'image'
export const isGradient = (f: Fill): f is Gradient => typeof f === 'object' && 'type' in f && f.type !== 'image'
/** Une couleur (chaîne ou couleur nommée), ni dégradé ni image. */
export const isColorFill = (f: Fill): f is Color => !(typeof f === 'object' && 'type' in f)

/** Les couleurs d'un remplissage (une seule pour une couleur, celles des arrêts pour un dégradé, aucune pour une image). */
export const fillColors = (f: Fill): Color[] => (isImageFill(f) ? [] : isGradient(f) ? f.stops.map((s) => s.color) : [f as Color])

/** Applique `fn` à chaque couleur d'un remplissage ; renvoie un nouveau remplissage. */
export function mapFillColors<F extends Fill>(f: F, fn: (c: Color) => Color): F {
  if (isImageFill(f)) return f
  if (!isGradient(f)) return fn(f as Color) as F
  const g: Gradient = f
  return { ...g, stops: g.stops.map((s) => ({ ...s, color: fn(s.color) })) } as F
}

/** Dégradé CSS d'un remplissage dégradé (couleurs déjà résolues par `color`). */
export function gradientCss(g: Gradient, color: (c: Color) => string): string {
  const stops = g.stops.map((s) => `${color(s.color)} ${round(s.position * 100)}%`).join(', ')
  if (g.type === 'linear') return `linear-gradient(${round(g.angle)}deg, ${stops})`
  if (g.type === 'conic') return `conic-gradient(from ${round(g.angle)}deg, ${stops})`
  return `radial-gradient(${stops})`
}

const round = (n: number) => Math.round(n * 100) / 100

// ——— Lecture tolérante ———

const SIDES: Record<string, number> = {
  top: 0, 'top right': 45, 'right top': 45, right: 90, 'bottom right': 135, 'right bottom': 135,
  bottom: 180, 'bottom left': 225, 'left bottom': 225, left: 270, 'top left': 315, 'left top': 315,
}

/** Angle CSS (« 135deg », « 0.25turn », « to right »…) en degrés, ou null. */
function cssAngle(s: string): number | null {
  const t = s.trim().toLowerCase()
  if (t.startsWith('to ')) return SIDES[t.slice(3).trim().replace(/\s+/g, ' ')] ?? null
  const m = /^(-?\d*\.?\d+)(deg|turn|rad|grad)?$/.exec(t)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2] ?? 'deg'
  if (unit === 'turn') return n * 360
  if (unit === 'rad') return (n * 180) / Math.PI
  if (unit === 'grad') return n * 0.9
  return n
}

/** Découpe sur les virgules de premier niveau (pas celles de rgba(…)). */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** « #fff 20% » → couleur et position (0..1) ; la position peut manquer. */
function cssStop(part: string): { color: Color; position?: number } | null {
  const m = /^(.*?)(?:\s+(-?\d*\.?\d+)%)?$/.exec(part.trim())
  if (!m) return null
  const color = normalizeColor(m[1]!)
  if (!color) return null
  return m[2] === undefined ? { color } : { color, position: Number(m[2]) / 100 }
}

type Kind = Gradient['type']
/** Angle par défaut : vers le bas pour un linéaire (comme en CSS), départ en haut pour un conique. */
const DEFAULT_ANGLE: Record<Kind, number> = { linear: 180, radial: 0, conic: 0 }

/** `linear-gradient(…)`, `radial-gradient(…)` ou `conic-gradient(…)` CSS → dégradé, sinon null. */
export function parseCssGradient(input: string): Gradient | null {
  const m = /^\s*(?:repeating-)?(linear|radial|conic)-gradient\(\s*([\s\S]*)\)\s*$/i.exec(input)
  if (!m) return null
  const kind = m[1]!.toLowerCase() as Kind
  const parts = splitTop(m[2]!)
  let angle = DEFAULT_ANGLE[kind]
  if (parts.length && !cssStop(parts[0]!)) {
    const head = parts.shift()!
    if (kind === 'linear') {
      const a = cssAngle(head)
      if (a === null) return null
      angle = a
    } else if (kind === 'conic') {
      // « from 90deg at 50% 50% » : seul l'angle compte, le centre reste au milieu.
      const from = /^\s*from\s+(\S+)/i.exec(head)
      if (from) {
        const a = cssAngle(from[1]!)
        if (a === null) return null
        angle = a
      } else if (!/^\s*at\s/i.test(head)) return null
    }
  }
  const stops = parts.map(cssStop)
  if (stops.some((s) => s === null)) return null
  return finish(kind, angle, stops as { color: Color; position?: number }[])
}

/** Couleur d'un arrêt : chaîne CSS, couleur nommée, ou objet {r,g,b,a} (0..1 comme Figma, ou 0..255). */
function stopColor(v: unknown, opacity: unknown): Color | null {
  let c: Color | null = null
  if (isObj(v) && isNum(v.r) && isNum(v.g) && isNum(v.b)) {
    const big = v.r > 1 || v.g > 1 || v.b > 1
    const k = big ? 1 : 255
    const a = isNum(v.a) ? v.a : 1
    c = normalizeColor(`rgba(${Math.round(v.r * k)}, ${Math.round(v.g * k)}, ${Math.round(v.b * k)}, ${Math.max(0, Math.min(1, a))})`)
  } else c = normalizeColorValue(v)
  if (c === null || !isNum(opacity) || opacity >= 1 || typeof c !== 'string') return c
  const alpha = (c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1) * Math.max(0, opacity)
  return c.slice(0, 7) + (alpha >= 1 ? '' : Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase())
}

/** Positions manquantes réparties régulièrement ; positions en pourcentage (> 1) ramenées à 0..1 ; tri. */
function finish(kind: Kind, angle: number, raw: { color: Color; position?: number }[]): Gradient | null {
  if (raw.length === 0) return null
  const list = raw.length === 1 ? [raw[0]!, { ...raw[0]! }] : raw
  const percent = list.some((s) => s.position !== undefined && s.position > 1)
  const n = list.length
  const stops: GradientStop[] = list.map((s, i) => {
    const p = s.position === undefined ? i / (n - 1) : percent ? s.position / 100 : s.position
    return { color: s.color, position: round(Math.max(0, Math.min(1, p)) * 10000) / 10000 }
  })
  stops.sort((a, b) => a.position - b.position)
  if (kind === 'radial') return { type: 'radial', stops }
  return { type: kind, angle: round(((angle % 360) + 360) % 360), stops }
}

const KINDS: Record<string, Kind> = {
  linear: 'linear', radial: 'radial', gradient_linear: 'linear', gradient_radial: 'radial',
  'linear-gradient': 'linear', 'radial-gradient': 'radial', lineargradient: 'linear', radialgradient: 'radial',
  conic: 'conic', angular: 'conic', gradient_angular: 'conic', gradient_conic: 'conic', 'conic-gradient': 'conic', conicgradient: 'conic',
}

/**
 * Objet dégradé sous une forme courante → dégradé de Maquette, sinon null :
 * {type:"linear"|"conic",angle,stops:[{color,position}]}, Figma {type:"GRADIENT_LINEAR"|"GRADIENT_ANGULAR",gradientStops:[{color:{r,g,b,a},position}]},
 * Pen {type:"gradient",gradientType:"linear",rotation,colors:[…]}, ou {type:"linear",from,to,via?}.
 */
export function parseGradientObject(v: unknown): Gradient | null {
  if (!isObj(v) || typeof v.type !== 'string') return null
  let kindKey = v.type.toLowerCase()
  if (kindKey === 'gradient') kindKey = typeof v.gradientType === 'string' ? v.gradientType.toLowerCase() : 'linear'
  const kind = KINDS[kindKey]
  if (!kind) return null
  const rawAngle = v.angle ?? v.rotation ?? v.deg
  const angle = isNum(rawAngle) ? rawAngle : typeof rawAngle === 'string' ? (cssAngle(rawAngle) ?? DEFAULT_ANGLE[kind]) : DEFAULT_ANGLE[kind]
  let list: unknown = v.stops ?? v.gradientStops ?? v.colors
  if (list === undefined && v.from !== undefined && v.to !== undefined) list = [v.from, ...(v.via !== undefined ? [v.via] : []), v.to]
  if (!Array.isArray(list)) return null
  const stops: { color: Color; position?: number }[] = []
  for (const s of list) {
    if (typeof s === 'string') {
      const c = cssStop(s)
      if (!c) return null
      stops.push(c)
      continue
    }
    if (!isObj(s)) return null
    const color = stopColor(s.color ?? s.value, s.opacity)
    if (color === null) return null
    const pos = s.position ?? s.offset ?? s.pos ?? s.stop
    stops.push(isNum(pos) ? { color, position: pos } : { color })
  }
  return finish(kind, angle, stops)
}

const FITS = new Set(['cover', 'contain', 'fill'])
/** Modes de Figma et Pen (fill = recadrer, fit = entière, stretch = étirée) → `fit` de Maquette. */
const SCALE_MODES: Record<string, ImageFill['fit']> = { fill: 'cover', crop: 'cover', tile: 'cover', fit: 'contain', stretch: 'fill' }

/**
 * Objet image sous une forme courante → remplissage image, sinon null : {type:"image",src,fit?},
 * `url`/`path` pour `src`, Figma/Pen `scaleMode`/`mode` (FILL, FIT, STRETCH). `fit` absent : cover.
 */
export function parseImageFill(v: unknown): ImageFill | null {
  if (!isObj(v) || typeof v.type !== 'string' || v.type.toLowerCase() !== 'image') return null
  const src = v.src ?? v.url ?? v.path
  if (typeof src !== 'string') return null
  const fit = typeof v.fit === 'string' && FITS.has(v.fit) ? v.fit as ImageFill['fit']
    : typeof (v.scaleMode ?? v.mode) === 'string' ? SCALE_MODES[String(v.scaleMode ?? v.mode).toLowerCase()] : 'cover'
  return fit ? { type: 'image', src, fit } : null
}

/**
 * Toute valeur de remplissage lisible → remplissage canonique, sinon null : couleur (chaîne CSS,
 * couleur nommée), dégradé CSS en chaîne, objet dégradé ou image (formes ci-dessus).
 */
export function normalizeFill(v: unknown): Fill | null {
  if (typeof v === 'string') return normalizeColor(v) ?? parseCssGradient(v)
  if (isObj(v) && typeof v.type === 'string') return v.type.toLowerCase() === 'image' ? parseImageFill(v) : parseGradientObject(v)
  return normalizeColorValue(v)
}
