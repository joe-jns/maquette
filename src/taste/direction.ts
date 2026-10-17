// Traduction d'une direction de taste-skill (sortie de `draw.mjs`) en styles du document.
// Code pur : ni Electron, ni DOM, ni node:*.
import { normalizeColor } from '../core/color'
import type { Op } from '../core/ops'
import type { MaquetteDocument, TextStyle } from '../core/types'

/** Les 22 secteurs de `draw.mjs`, dans son ordre. */
export const SECTORS: { id: string; label: string }[] = [
  { id: 'saas', label: 'Logiciel en ligne' },
  { id: 'dev-tool', label: 'Outil pour développeurs' },
  { id: 'ai-product', label: 'Produit d’intelligence artificielle' },
  { id: 'consumer-app', label: 'Application grand public' },
  { id: 'finance', label: 'Finance' },
  { id: 'agency', label: 'Agence' },
  { id: 'studio-portfolio', label: 'Portfolio de studio' },
  { id: 'personal-portfolio', label: 'Portfolio personnel' },
  { id: 'ecommerce', label: 'Boutique en ligne' },
  { id: 'physical-product', label: 'Produit physique' },
  { id: 'fashion', label: 'Mode' },
  { id: 'hospitality', label: 'Hôtellerie' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'real-estate', label: 'Immobilier' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'event', label: 'Événement' },
  { id: 'health', label: 'Santé' },
  { id: 'education', label: 'Enseignement' },
  { id: 'nonprofit', label: 'Association' },
  { id: 'culture', label: 'Culture' },
  { id: 'music', label: 'Musique' },
  { id: 'other', label: 'Autre' },
]

/** Les 7 tons de `draw.mjs`. */
export const TONES: { id: string; label: string }[] = [
  { id: 'quiet', label: 'Calme' },
  { id: 'bold', label: 'Audacieux' },
  { id: 'warm', label: 'Chaleureux' },
  { id: 'technical', label: 'Technique' },
  { id: 'playful', label: 'Ludique' },
  { id: 'luxury', label: 'Luxe' },
  { id: 'editorial', label: 'Éditorial' },
]

export interface DirectionOption { id: string; name: string; idea: string; composition: string; needs?: string }

export interface DirectionFace {
  family: string
  source: 'google' | 'fontshare'
  slug?: string
  weights?: number[]
  italic?: boolean
  settings?: string
}

/** Ce que Maquette lit d'une fiche `draw.mjs --direction` (le reste est ignoré). */
export interface DirectionSheet {
  palette: {
    bg: string
    surface?: string
    ink: string
    muted?: string
    accent?: string
    accentInk?: string
    fields?: { bg: string; ink?: string }[]
  }
  type: { display: DirectionFace; text: DirectionFace }
}

export interface DirectionFont { family: string; source: 'google' | 'fontshare'; slug?: string; weights: number[] }

export interface DirectionStyles {
  colors: { name: string; value: string }[]
  text: Omit<TextStyle, 'id'>[]
  fonts: DirectionFont[]
}

export interface Settings { weight?: number; trackingEm?: number; leading?: number; uppercase?: boolean }

/** Sections `## \`id\` — Nom` de `draw.mjs --options`. */
export function parseOptions(markdown: string): DirectionOption[] {
  const out: DirectionOption[] = []
  let cur: DirectionOption | null = null
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    const head = /^##\s+`([^`]+)`(?:\s+[^\sA-Za-z0-9]+)?\s*(.*)$/.exec(line)
    if (head) {
      cur = { id: head[1]!.trim(), name: head[2]!.trim() || head[1]!.trim(), idea: '', composition: '' }
      out.push(cur)
      continue
    }
    if (!cur) continue
    const field = /^(Idea engine|Composition|Needs):\s*(.*)$/.exec(line)
    if (!field) continue
    const value = field[2]!.trim()
    if (field[1] === 'Idea engine') cur.idea = value
    else if (field[1] === 'Composition') cur.composition = value
    else cur.needs = value
  }
  return out
}

/** `weight 700 · tracking -0.03em · leading 0.9 · uppercase` → réglages chiffrés. */
export function parseSettings(settings: string): Settings {
  const out: Settings = {}
  // « · », sa version mal décodée (« Â· ») ou le caractère de remplacement.
  for (const part of settings.split(/\s*(?:Â?·|�)\s*/)) {
    const s = part.trim().toLowerCase()
    let m: RegExpExecArray | null
    if ((m = /^weight\s+(\d{3})\b/.exec(s))) out.weight = Number(m[1])
    else if ((m = /^tracking\s+(-?\d*\.?\d+)(?:em)?\b/.exec(s))) out.trackingEm = Number(m[1])
    else if ((m = /^leading\s+(\d*\.?\d+)\b/.exec(s))) out.leading = Number(m[1])
    else if (/^(uppercase|all caps|capitals)\b/.test(s)) out.uppercase = true
  }
  return out
}

const SIZES: { name: string; size: number; role: 'display' | 'text' }[] = [
  { name: 'Titre 1', size: 72, role: 'display' },
  { name: 'Titre 2', size: 48, role: 'display' },
  { name: 'Titre 3', size: 32, role: 'display' },
  { name: 'Texte large', size: 20, role: 'text' },
  { name: 'Texte', size: 16, role: 'text' },
  { name: 'Petit', size: 13, role: 'text' },
]

const round2 = (n: number): number => Math.round(n * 100) / 100 || 0

/** Palette et typographie d'une direction → couleurs nommées, styles de texte et polices à charger. */
export function directionStyles(sheet: DirectionSheet): DirectionStyles {
  const p = sheet.palette
  const named: [string, string | undefined][] = [
    ['Fond', p.bg],
    ['Surface', p.surface],
    ['Encre', p.ink],
    ['Discret', p.muted],
    ['Accent', p.accent],
    ['Sur accent', p.accentInk],
    ...(p.fields ?? []).map((f, i): [string, string | undefined] => [`Aplat ${i + 1}`, f.bg]),
  ]
  const colors: DirectionStyles['colors'] = []
  for (const [name, raw] of named) {
    const value = typeof raw === 'string' ? normalizeColor(raw) : null
    if (value) colors.push({ name, value })
  }

  const { display, text: body } = sheet.type
  const ds = parseSettings(display.settings ?? '')
  const ts = parseSettings(body.settings ?? '')
  const displayWeight = ds.weight ?? display.weights?.[display.weights.length - 1] ?? 700
  const role = {
    display: { family: display.family, weight: displayWeight, leading: ds.leading ?? 1.1, tracking: ds.trackingEm ?? 0 },
    text: { family: body.family, weight: 400, leading: ts.leading ?? 1.5, tracking: ts.trackingEm ?? 0 },
  }
  const text = SIZES.map(({ name, size, role: r }): Omit<TextStyle, 'id'> => ({
    name,
    fontFamily: role[r].family,
    fontWeight: role[r].weight,
    fontStyle: 'normal',
    fontSize: size,
    lineHeight: Math.round(role[r].leading * size),
    letterSpacing: round2(role[r].tracking * size),
  }))

  const fonts: DirectionFont[] = []
  const addFont = (face: DirectionFace, used: number) => {
    const weights = [...(face.weights ?? []), used]
    const found = fonts.find((f) => f.family === face.family)
    if (found) {
      found.weights = [...new Set([...found.weights, ...weights])].sort((a, b) => a - b)
      return
    }
    const font: DirectionFont = { family: face.family, source: face.source, weights: [...new Set(weights)].sort((a, b) => a - b) }
    if (face.slug) font.slug = face.slug
    fonts.push(font)
  }
  addFont(display, role.display.weight)
  addFont(body, role.text.weight)

  return { colors, text, fonts }
}

/** Opérations qui posent les styles d'une direction ; un style du même nom est mis à jour, pas dupliqué. */
export function applyDirectionOps(doc: MaquetteDocument, styles: DirectionStyles): Op[] {
  const ops: Op[] = []
  for (const c of styles.colors) {
    const id = doc.styles.colors.find((s) => s.name === c.name)?.id
    ops.push(id ? { op: 'style.color.set', id, name: c.name, value: c.value } : { op: 'style.color.set', name: c.name, value: c.value })
  }
  for (const t of styles.text) {
    const id = doc.styles.text.find((s) => s.name === t.name)?.id
    ops.push(id ? { op: 'style.text.set', id, ...t } : { op: 'style.text.set', ...t })
  }
  return ops
}
