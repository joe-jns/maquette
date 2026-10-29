import type { Color, ConicGradient, GradientStop, LinearGradient, RadialGradient } from '../types'

/**
 * Géométrie de l'import Pen : arcs et anneaux d'ellipse, polygones réguliers (tracés SVG), et dégradés
 * Pen (centre et taille normalisés à la boîte) traduits en dégradés CSS de Maquette. Les formules des
 * dégradés suivent l'export CSS de Pen 1.2.16. Code pur.
 */

const r3 = (n: number) => Math.round(n * 1000) / 1000
const f = (n: number) => String(r3(n))
const rad = (deg: number) => (deg * Math.PI) / 180

/** Point d'une ellipse à l'angle `deg` (degrés, sens anti-horaire depuis la droite, comme Pen). */
function on(cx: number, cy: number, rx: number, ry: number, deg: number): [number, number] {
  return [cx + rx * Math.cos(rad(deg)), cy - ry * Math.sin(rad(deg))]
}

function fullEllipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}Z`
}

/**
 * Ellipse Pen avec anneau (`innerRadius` 0..1) et/ou arc (`startAngle`, `sweepAngle` en degrés, positif =
 * anti-horaire) → tracé SVG dans la boîte [0, 0, w, h], avec sa règle de remplissage.
 */
export function arcPath(w: number, h: number, inner: number, start: number, sweep: number): { path: string; fillRule: 'nonzero' | 'evenodd' } {
  const cx = w / 2
  const cy = h / 2
  const rx = w / 2
  const ry = h / 2
  const ir = Math.max(0, Math.min(1, inner))
  if (Math.abs(sweep) >= 360) {
    if (ir <= 0) return { path: fullEllipse(cx, cy, rx, ry), fillRule: 'nonzero' }
    return { path: fullEllipse(cx, cy, rx, ry) + fullEllipse(cx, cy, rx * ir, ry * ir), fillRule: 'evenodd' }
  }
  const end = start + sweep
  const large = Math.abs(sweep) > 180 ? 1 : 0
  // SVG : drapeau 1 = sens horaire à l'écran (y vers le bas) ; Pen : positif = anti-horaire.
  const flag = sweep > 0 ? 0 : 1
  const [sx, sy] = on(cx, cy, rx, ry, start)
  const [ex, ey] = on(cx, cy, rx, ry, end)
  const outer = `M${f(sx)} ${f(sy)}A${f(rx)} ${f(ry)} 0 ${large} ${flag} ${f(ex)} ${f(ey)}`
  if (ir <= 0) return { path: `M${f(cx)} ${f(cy)}L${f(sx)} ${f(sy)}A${f(rx)} ${f(ry)} 0 ${large} ${flag} ${f(ex)} ${f(ey)}Z`, fillRule: 'nonzero' }
  const [ix, iy] = on(cx, cy, rx * ir, ry * ir, end)
  const [jx, jy] = on(cx, cy, rx * ir, ry * ir, start)
  return {
    path: `${outer}L${f(ix)} ${f(iy)}A${f(rx * ir)} ${f(ry * ir)} 0 ${large} ${1 - flag} ${f(jx)} ${f(jy)}Z`,
    fillRule: 'nonzero',
  }
}

/** Polygone régulier à `n` sommets inscrit dans la boîte, premier sommet en haut. */
export function polygonPath(w: number, h: number, n: number): string {
  const count = Math.max(3, Math.round(n))
  const pts: string[] = []
  for (let k = 0; k < count; k++) {
    const a = rad(-90 + (k * 360) / count)
    pts.push(`${f(w / 2 + (w / 2) * Math.cos(a))} ${f(h / 2 + (h / 2) * Math.sin(a))}`)
  }
  return `M${pts.join('L')}Z`
}

// ——— Dégradés ———

/** Arrêt d'un dégradé Pen lu : couleur gardée (variable comprise), sa valeur hexadécimale, position. */
export interface PenStop { color: Color; hex: string; position: number }

const hexChannels = (hex: string): [number, number, number, number] => {
  const h = hex.replace('#', '')
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
  return [n(0), n(2), n(4), h.length >= 8 ? n(6) : 255]
}
const toHex = (c: number[]) => {
  const s = c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()
  return `#${s.endsWith('FF') ? s.slice(0, 6) : s}`
}

/** Couleur à mi-chemin (t de 0 à 1) entre deux couleurs hexadécimales. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexChannels(a)
  const cb = hexChannels(b)
  return toHex(ca.map((v, i) => v + (cb[i]! - v) * t))
}

/**
 * Arrêts ramenés dans 0..1 (le modèle n'en accepte pas ailleurs) : ceux qui débordent sont coupés et
 * remplacés par la couleur interpolée au bord. Au moins deux arrêts.
 */
export function clampStops(list: PenStop[]): GradientStop[] {
  const s = [...list].sort((a, b) => a.position - b.position)
  if (s.length === 0) return []
  const at = (p: number): string => {
    if (p <= s[0]!.position) return s[0]!.hex
    if (p >= s[s.length - 1]!.position) return s[s.length - 1]!.hex
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1]!
      const b = s[i]!
      if (p <= b.position) return mixHex(a.hex, b.hex, b.position === a.position ? 0 : (p - a.position) / (b.position - a.position))
    }
    return s[s.length - 1]!.hex
  }
  const out: GradientStop[] = []
  const first = s[0]!.position
  const last = s[s.length - 1]!.position
  if (first < 0) out.push({ color: at(0), position: 0 })
  for (const st of s) if (st.position >= 0 && st.position <= 1) out.push({ color: st.color, position: r4(st.position) })
  if (last > 1) out.push({ color: at(1), position: 1 })
  // Tout hors de la boîte d'un même côté : une seule couleur, deux arrêts.
  if (out.length === 0) out.push({ color: at(first > 1 ? 0 : 1), position: 0 })
  if (out.length === 1) return [{ ...out[0]!, position: 0 }, { ...out[0]!, position: 1 }]
  return out
}

const r4 = (n: number) => Math.round(n * 10000) / 10000
const normAngle = (a: number) => r3(((a % 360) + 360) % 360)

export interface PenGradientGeometry {
  /** Degrés, sens anti-horaire, 0 = vers le haut (Pen). */
  rotation: number
  center: { x: number; y: number }
  size: { width: number; height: number }
}

/** Dégradé linéaire Pen sur une boîte w × h → dégradé CSS équivalent (angle et positions). */
export function penLinear(stops: PenStop[], g: PenGradientGeometry, w: number, h: number): LinearGradient {
  const W = Math.max(w, 1e-6)
  const H = Math.max(h, 1e-6)
  const half = g.size.height / 2
  // Vecteur du centre vers la fin, dans le carré unité (anti-horaire depuis le haut), puis étiré à la boîte.
  const vx = -Math.sin(rad(g.rotation)) * half * W
  const vy = -Math.cos(rad(g.rotation)) * half * H
  const len = Math.hypot(vx, vy)
  if (len < 1e-6) return { type: 'linear', angle: 0, stops: clampStops(stops) }
  const ox = vx / len
  const oy = vy / len
  const l = Math.abs(W * ox) + Math.abs(H * oy) || 1e-6
  const sx = g.center.x * W
  const sy = g.center.y * H
  const mapped = stops.map((s) => {
    const k = 2 * s.position - 1
    const px = sx + vx * k - W / 2
    const py = sy + vy * k - H / 2
    return { ...s, position: 0.5 + (px * ox + py * oy) / l }
  })
  return { type: 'linear', angle: normAngle((Math.atan2(vx, -vy) * 180) / Math.PI), stops: clampStops(mapped) }
}

/**
 * Dégradé radial Pen → radial CSS centré (ellipse jusqu'au coin le plus loin) ; un centre décalé est
 * approché par un dégradé linéaire orienté vers lui. `offCenter` dit si l'approximation a servi.
 */
export function penRadial(stops: PenStop[], g: PenGradientGeometry, w: number, h: number): { gradient: RadialGradient | LinearGradient; offCenter: boolean } {
  const W = Math.max(w, 1e-6)
  const H = Math.max(h, 1e-6)
  const dx = (g.center.x - 0.5) * W
  const dy = (g.center.y - 0.5) * H
  const off = Math.abs(g.center.x - 0.5) + Math.abs(g.center.y - 0.5) > 0.15
  if (!off) {
    // Rayon Pen = taille/2 de la boîte ; rayon CSS (coin le plus loin) = boîte/2 × √2.
    const k = ((g.size.width + g.size.height) / 2) / Math.SQRT2
    return { gradient: { type: 'radial', stops: clampStops(stops.map((s) => ({ ...s, position: s.position * k }))) }, offCenter: false }
  }
  const len = Math.hypot(dx, dy)
  const ox = dx / len
  const oy = dy / len
  const l = Math.abs(W * ox) + Math.abs(H * oy) || 1e-6
  const tc = 0.5 + (dx * ox + dy * oy) / l
  // Rayon de l'ellipse Pen dans la direction du centre décalé.
  const a = Math.max((g.size.width / 2) * W, 1e-6)
  const b = Math.max((g.size.height / 2) * H, 1e-6)
  const r = 1 / Math.sqrt((ox / a) ** 2 + (oy / b) ** 2)
  const mapped = stops.map((s) => ({ ...s, position: tc - (s.position * r) / l }))
  return {
    gradient: { type: 'linear', angle: normAngle((Math.atan2(dx, -dy) * 180) / Math.PI), stops: clampStops(mapped) },
    offCenter: true,
  }
}

/** Dégradé angulaire Pen → conique CSS (`from -rotation`), toujours centré. */
export function penConic(stops: PenStop[], g: PenGradientGeometry): { gradient: ConicGradient; offCenter: boolean } {
  const offCenter = Math.abs(g.center.x - 0.5) + Math.abs(g.center.y - 0.5) > 0.02
  return { gradient: { type: 'conic', angle: normAngle(-g.rotation), stops: clampStops(stops) }, offCenter }
}
