/**
 * Styles archétypes de Pen (vendor/design/styles.json, extraits par scripts/extract-pen-styles.mjs) :
 * liste, variantes, fiche complète, et traduction en couleurs nommées et styles de texte.
 * Code pur : ni Electron, ni DOM, ni node:*.
 */
import { normalizeColor } from '../../core/color'
import type { TextStyle } from '../../core/types'
import type { DirectionFont, DirectionStyles } from '../../taste/direction'

export interface StyleParam { source: string; keys?: string[]; options?: string[] }
export interface StyleEntry { name: string; description: string; content: string; parameters: Record<string, StyleParam> }
/** Ombre telle que Pen la décrit (couleur hexadécimale brute). */
export interface StyleShadow { x: number; y: number; blur: number; spread: number; color: string; inset: boolean }
export interface StyleVariant { name: string; style: string; params: Record<string, string> }
export interface StyleLibrary {
  quality: string
  styles: StyleEntry[]
  variants: StyleVariant[]
  palettes: Record<string, Record<string, string>>
  roundness: Record<string, Record<string, number>>
  elevation: Record<string, Record<string, StyleShadow[]>>
  imagery: Record<string, string>
  fontWeights: Record<string, number[]>
}

/** Rôles de palette de Pen → noms des couleurs du document (les mêmes que l'onglet Direction quand ils se recoupent). */
export const COLOR_NAMES: Record<string, string> = {
  'surface.primary': 'Fond',
  'surface.secondary': 'Surface',
  'surface.tertiary': 'Surface 2',
  'surface.inverse': 'Fond inversé',
  'foreground.primary': 'Encre',
  'foreground.secondary': 'Encre secondaire',
  'foreground.muted': 'Discret',
  'foreground.inverse': 'Encre inversée',
  'border.primary': 'Bordure',
  'border.subtle': 'Bordure douce',
  'accent.primary': 'Accent',
  'accent.secondary': 'Accent 2',
  'accent.tertiary': 'Accent 3',
  'status.success': 'Succès',
  'status.warning': 'Alerte',
  'status.error': 'Erreur',
  'status.info': 'Info',
}

const ROLE_LABELS: Record<string, string> = { headings: 'titres', body: 'texte', captions: 'légendes', data: 'chiffres', expression: 'expression' }

/** Comparaison souple des noms : casse, accents, tirets et espaces ignorés. */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_\-–—]+/g, ' ').trim()

export function findStyle(lib: StyleLibrary, name: string): StyleEntry | undefined {
  const n = fold(name)
  return lib.styles.find((s) => fold(s.name) === n)
}

/** Nom court d'une variante : ce qui suit « Style - », ou le nom entier. */
export function variantLabel(v: StyleVariant): string {
  const prefix = `${v.style} - `
  return v.name.startsWith(prefix) ? v.name.slice(prefix.length) : v.name
}

export const variantsOf = (lib: StyleLibrary, style: StyleEntry): StyleVariant[] => lib.variants.filter((v) => v.style === style.name)

export function findVariant(lib: StyleLibrary, style: StyleEntry, name: string): StyleVariant | undefined {
  const n = fold(name)
  return variantsOf(lib, style).find((v) => fold(variantLabel(v)) === n || fold(v.name) === n || fold(v.params.colorPalette ?? '') === n)
}

/** Fond et encre de base, toujours posés : Fond et Encre existent pour chaque style. */
const BASE_KEYS = ['surface.primary', 'foreground.primary']

/** Style sombre : il ne cite que les rôles inversés, qui sont alors son fond et son encre. */
const isDark = (keys: string[] | undefined) => !!keys?.includes('surface.inverse') && !keys.includes('surface.primary')
const DARK_NAMES: Record<string, string> = { 'surface.inverse': 'Fond', 'foreground.inverse': 'Encre' }

/** Clés de palette utilisées par le style (toutes sauf les états si le style n'en dit rien), dans l'ordre de la palette. */
function paletteKeys(lib: StyleLibrary, style: StyleEntry, v: StyleVariant): string[] {
  const all = Object.keys(lib.palettes[v.params.colorPalette ?? ''] ?? {})
  const keys = style.parameters.colorPalette?.keys
  const wanted = new Set(keys?.length ? [...(isDark(keys) ? [] : BASE_KEYS), ...keys] : all.filter((k) => !k.startsWith('status.')))
  return all.filter((k) => wanted.has(k))
}

export function paletteOf(lib: StyleLibrary, style: StyleEntry, v: StyleVariant): { name: string; value: string; role: string }[] {
  const palette = lib.palettes[v.params.colorPalette ?? ''] ?? {}
  const dark = isDark(style.parameters.colorPalette?.keys)
  const out: { name: string; value: string; role: string }[] = []
  for (const role of paletteKeys(lib, style, v)) {
    const value = palette[role] ? normalizeColor(palette[role]) : null
    if (value) out.push({ name: (dark && DARK_NAMES[role]) || COLOR_NAMES[role] || role, value, role })
  }
  return out
}

// ——— Graisses ———

interface Weights { headings?: number; body?: number; captions?: number; data?: number }

/** « start with X at its real 900 display weight and Y at 400 for explanations… Z at 500 supplies short context; D at 800 can promote… ». */
export function parseWeights(content: string): Weights {
  const out: Weights = {}
  const m = /at its real (\d{3}) display weight and .+? at (\d{3}) for explanations/.exec(content)
  if (m) {
    out.headings = Number(m[1])
    out.body = Number(m[2])
  }
  const c = /at (\d{3}) supplies short context/.exec(content)
  if (c) out.captions = Number(c[1])
  const d = /at (\d{3}) can promote/.exec(content)
  if (d) out.data = Number(d[1])
  return out
}

/** Graisse disponible la plus proche de celle voulue (graisses inconnues : celle voulue). */
export function nearestWeight(wanted: number, available: number[] | undefined): number {
  if (!available?.length) return wanted
  // Graisse variable (750, 650…) : gardée si elle tombe dans l'étendue de la famille.
  const min = available[0]!
  const max = available[available.length - 1]!
  if (available.length >= 3 && wanted >= min && wanted <= max) return wanted
  return available.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), available[0]!)
}

export interface StyleFonts { role: string; family: string; weight: number }

export function fontsOf(lib: StyleLibrary, style: StyleEntry, v: StyleVariant): StyleFonts[] {
  const parsed = parseWeights(style.content)
  const defaults: Record<string, number> = { headings: 600, body: 400, captions: 500, data: 600, expression: 400 }
  const out: StyleFonts[] = []
  for (const role of ['headings', 'body', 'captions', 'data', 'expression']) {
    const family = v.params[role]
    if (!family) continue
    const wanted = (parsed as Record<string, number | undefined>)[role] ?? defaults[role]!
    out.push({ role, family, weight: nearestWeight(wanted, lib.fontWeights[family]) })
  }
  return out
}

// ——— Styles du document ———

const SCALE: { name: string; size: number; role: 'headings' | 'body' | 'captions'; leading: number }[] = [
  { name: 'Titre 1', size: 72, role: 'headings', leading: 1.1 },
  { name: 'Titre 2', size: 48, role: 'headings', leading: 1.1 },
  { name: 'Titre 3', size: 32, role: 'headings', leading: 1.15 },
  { name: 'Texte large', size: 20, role: 'body', leading: 1.5 },
  { name: 'Texte', size: 16, role: 'body', leading: 1.5 },
  { name: 'Petit', size: 13, role: 'captions', leading: 1.4 },
]

/** Couleurs nommées, styles de texte (échelle 72/48/32/20/16/13) et polices d'une variante. */
export function styleStyles(lib: StyleLibrary, style: StyleEntry, v: StyleVariant): DirectionStyles {
  const fonts = fontsOf(lib, style, v)
  const byRole = (role: string) => fonts.find((f) => f.role === role)
  const body = byRole('body') ?? byRole('headings')!
  const pick = (role: 'headings' | 'body' | 'captions') => byRole(role) ?? (role === 'headings' ? body : body)
  const text: Omit<TextStyle, 'id'>[] = SCALE.map(({ name, size, role, leading }) => {
    const f = pick(role)
    return { name, fontFamily: f.family, fontWeight: f.weight, fontStyle: 'normal', fontSize: size, lineHeight: Math.round(size * leading), letterSpacing: 0 }
  })
  const heading = pick('headings')
  const data = byRole('data')
  if (data && data.family !== heading.family) {
    text.push({ name: 'Chiffres', fontFamily: data.family, fontWeight: data.weight, fontStyle: 'normal', fontSize: 40, lineHeight: 44, letterSpacing: 0 })
  }
  const expression = byRole('expression')
  if (expression) {
    text.push({ name: 'Expression', fontFamily: expression.family, fontWeight: expression.weight, fontStyle: 'italic', fontSize: 32, lineHeight: 38, letterSpacing: 0 })
  }
  const used = new Map<string, Set<number>>()
  for (const t of text) used.set(t.fontFamily, (used.get(t.fontFamily) ?? new Set()).add(t.fontWeight))
  const families: DirectionFont[] = [...used].map(([family, weights]) => ({ family, source: 'google', weights: [...weights].sort((a, b) => a - b) }))
  return { colors: paletteOf(lib, style, v).map(({ name, value }) => ({ name, value })), text, fonts: families }
}

// ——— Textes renvoyés à Claude ———

export function listStyles(lib: StyleLibrary): string {
  return [
    `Styles archétypes de Pen (${lib.styles.length}) — style("<nom>") pour ses variantes :`,
    ...lib.styles.map((s) => `- ${s.name} : ${s.description}`),
  ].join('\n')
}

function variantLine(lib: StyleLibrary, style: StyleEntry, v: StyleVariant): string {
  const fonts = fontsOf(lib, style, v).map((f) => `${ROLE_LABELS[f.role]} ${f.family}`).join(' · ')
  const colors = paletteOf(lib, style, v).filter((c) => ['Fond', 'Encre', 'Accent'].includes(c.name)).map((c) => `${c.name.toLowerCase()} ${c.value}`).join(', ')
  return `- ${variantLabel(v)} : ${fonts} · ${colors}`
}

export function listVariants(lib: StyleLibrary, style: StyleEntry): string {
  return [
    `# ${style.name}`,
    style.description,
    `Variantes — style("${style.name}", "<variante>") pour la fiche, appliquer:true pour l'appliquer :`,
    ...variantsOf(lib, style).map((v) => variantLine(lib, style, v)),
  ].join('\n')
}

const shadowText = (s: StyleShadow) =>
  `{x:${s.x},y:${s.y},blur:${s.blur},spread:${s.spread},color:"${normalizeColor(s.color) ?? s.color}"${s.inset ? ',inset:true' : ''}}`

/** Fiche complète : texte d'identité de Pen et valeurs concrètes de la variante. */
export function styleSheet(lib: StyleLibrary, style: StyleEntry, v: StyleVariant): string {
  const lines = [style.content.replace(/^[^\n]*\n+/, `# ${style.name} — ${variantLabel(v)}\n\n`), '', '# Valeurs de cette variante', '']
  lines.push(`Polices (Google Fonts) : ${fontsOf(lib, style, v).map((f) => `${ROLE_LABELS[f.role]} ${f.family} ${f.weight}`).join(' · ')}`)
  lines.push(
    `Palette « ${v.params.colorPalette} » (référence modifiable : choisis les couleurs finales pour le produit ; jamais de fond beige, crème, ivoire ni blanc cassé chaud) : ` +
      paletteOf(lib, style, v).map((c) => `${c.name} (${c.role}) ${c.value}`).join(' · '),
  )
  const round = lib.roundness[v.params.roundness ?? '']
  const roundKeys = style.parameters.roundness?.keys ?? Object.keys(round ?? {})
  if (round) lines.push(`Arrondis : ${roundKeys.filter((k) => k in round).map((k) => `${k} ${round[k]}`).join(' · ')}`)
  const elevation = lib.elevation[v.params.elevation ?? '']
  if (elevation) {
    lines.push(`Élévation « ${v.params.elevation} » (shadows du style) :`)
    for (const [level, list] of Object.entries(elevation)) lines.push(`  ${level} : [${list.map(shadowText).join(', ')}]`)
  }
  const imagery = v.params.decorativeImagery
  if (imagery && lib.imagery[imagery]) lines.push('', `# Imagerie : ${imagery}`, '', lib.imagery[imagery].replace(/^###[^\n]*\n+/, ''))
  lines.push('', `Styles de texte créés par appliquer:true : Titre 1 72 · Titre 2 48 · Titre 3 32 (titres) · Texte large 20 · Texte 16 (texte) · Petit 13 (légendes).`)
  lines.push('Règles de qualité communes à tous les styles : guide("qualite").')
  return lines.join('\n')
}
