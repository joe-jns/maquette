import { icons as PHOSPHOR_ICONS } from '@phosphor-icons/core'
import FEATHER from 'feather-icons/dist/icons.json'
import type { IconSet, IconWeight, PhosphorWeight } from '../types'
import { FALLBACK_ICON, ICON_NAMES as LUCIDE_NAMES, iconKey, lucideTags, resolveIcon as resolveLucide, searchIcons as searchLucide } from './lucide'
import MATERIAL_NAMES from './materialNames.json'
import { rankIcons } from './search'

/**
 * Les quatre jeux d'icônes embarqués : noms, recherche, variantes, correspondance avec Pen.
 * - Lucide (lucide-static, licence ISC) : voir lucide.ts.
 * - Phosphor (@phosphor-icons/core, licence MIT) : six variantes, thin à bold, fill et duotone.
 * - Feather (feather-icons, licence MIT) : l'ancêtre de Lucide, au trait.
 * - Material Symbols Rounded (@material-symbols/svg-400, licence Apache-2.0) : contour ou plein ;
 *   seule la graisse 400 est embarquée, les autres graisses sont gardées dans le document et
 *   dessinées en 400.
 * Les tracés sont lus par le rendu (renderer/canvas/iconPaths.ts) ; ce module reste léger et pur.
 */

export const ICON_SETS: readonly IconSet[] = ['lucide', 'phosphor', 'feather', 'material-rounded']
export const ICON_SET_LABELS: Record<IconSet, string> = {
  lucide: 'Lucide',
  phosphor: 'Phosphor',
  feather: 'Feather',
  'material-rounded': 'Material Rounded',
}
export const PHOSPHOR_WEIGHTS: readonly PhosphorWeight[] = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone']
export const MATERIAL_WEIGHTS: readonly number[] = [100, 200, 300, 400, 500, 600, 700]
/** Graisse numérique de chaque variante au trait de Phosphor (fill et duotone sont des styles, pas des graisses). */
const PHOSPHOR_NUMERIC: [PhosphorWeight, number][] = [['thin', 100], ['light', 300], ['regular', 400], ['bold', 700]]

export const isIconSet = (v: unknown): v is IconSet => typeof v === 'string' && (ICON_SETS as readonly string[]).includes(v)

// ——— Noms ———

/** Le catalogue Phosphor, sans ses types littéraux (1 500 entrées : trop lourds pour le vérificateur). */
const PHOSPHOR = PHOSPHOR_ICONS as unknown as readonly { name: string; tags: readonly string[]; alias?: { name: string } }[]
const PHOSPHOR_NAMES: readonly string[] = PHOSPHOR.map((i) => i.name).sort()
const PHOSPHOR_TAGS = new Map<string, readonly string[]>(PHOSPHOR.map((i) => [i.name, i.tags.filter((t) => !t.startsWith('*'))]))
const PHOSPHOR_ALIASES = new Map(PHOSPHOR.flatMap((i) => (i.alias ? [[i.alias.name, i.name] as const] : [])))
const FEATHER_NAMES: readonly string[] = Object.keys(FEATHER as Record<string, string>).sort()
const MATERIAL: readonly string[] = MATERIAL_NAMES as string[]

const NAMES: Record<IconSet, readonly string[]> = {
  lucide: LUCIDE_NAMES,
  phosphor: PHOSPHOR_NAMES,
  feather: FEATHER_NAMES,
  'material-rounded': MATERIAL,
}
const NAME_SETS = Object.fromEntries(ICON_SETS.map((s) => [s, new Set(NAMES[s])])) as unknown as Record<IconSet, ReadonlySet<string>>

/** Icône dessinée à la place d'un nom inconnu, par jeu. */
export const FALLBACK_ICONS: Record<IconSet, string> = {
  lucide: FALLBACK_ICON,
  phosphor: 'question',
  feather: 'help-circle',
  'material-rounded': 'help',
}

export const iconNames = (set: IconSet): readonly string[] => NAMES[set]

/** « ph:CaretRight », « caret-right-bold » → « caret-right » ; « ContentCut », « inventory-2 » → « content_cut », « inventory_2 ». */
function candidates(set: IconSet, raw: string): string[] {
  const key = iconKey(raw.replace(/^\s*(?:ph|phosphor|feather|fe|material[-\w ]*|ms|mi)\s*[:/]\s*/i, ''))
  switch (set) {
    case 'phosphor': {
      const bare = key.replace(/^ph-/, '')
      return [bare, bare.replace(/-(?:thin|light|regular|bold|fill|duotone)$/, ''), bare.replace(/-icon$/, '')]
    }
    case 'feather':
      return [key, key.replace(/-icon$/, '')]
    case 'material-rounded': {
      // Les chiffres restent collés au mot dans « 10k » ou « 3d_rotation », séparés dans « inventory_2 ».
      const plain = raw.trim().toLowerCase().replace(/^(?:material[-\w ]*|ms|mi)\s*[:/]\s*/, '').replace(/[\s.-]+/g, '_')
      return [plain, key.replace(/-/g, '_'), key.replace(/-/g, '_').replace(/_fill$/, '')]
    }
    case 'lucide':
      return [key]
  }
}

/**
 * Nom d'icône du jeu pour une saisie libre (casse, préfixe, suffixe de variante, ancien nom).
 * Lucide : voir resolveIcon de lucide.ts. Sinon null.
 */
export function resolveIconIn(set: IconSet, raw: string): string | null {
  if (set === 'lucide') return resolveLucide(raw)
  const names = NAME_SETS[set]
  if (names.has(raw)) return raw
  for (const k of candidates(set, raw)) {
    if (names.has(k)) return k
    const alias = set === 'phosphor' ? PHOSPHOR_ALIASES.get(k) : undefined
    if (alias) return alias
  }
  return null
}

const tagsOf = (set: IconSet) => (name: string): readonly string[] => {
  if (set === 'phosphor') return PHOSPHOR_TAGS.get(name) ?? []
  // Feather : les étiquettes de l'icône Lucide qui en descend.
  if (set === 'feather') return lucideTags(resolveLucide(name) ?? name)
  return []
}

/** Icônes d'un jeu qui correspondent à une recherche (anglais ou français courant), meilleures d'abord. */
export function searchIconsIn(set: IconSet, query: string, limit = 40): string[] {
  if (set === 'lucide') return searchLucide(query, limit)
  return rankIcons(NAMES[set], tagsOf(set), query, resolveIconIn(set, query), limit)
}

// ——— Variantes ———

const nearest = <T>(choices: [T, number][], n: number): T =>
  // À égale distance, la plus grasse.
  choices.reduce((best, c) => (Math.abs(c[1] - n) <= Math.abs(best[1] - n) ? c : best))[0]

/** Variante Phosphor la plus proche d'une graisse numérique (Pen : 100 à 700). */
export const phosphorWeightFor = (n: number): PhosphorWeight => nearest(PHOSPHOR_NUMERIC, n)

/** Graisse Material (100 à 700, par centaines) la plus proche. */
export const materialWeightFor = (n: number): number => Math.min(700, Math.max(100, Math.round(n / 100) * 100))

/**
 * Variante valide pour le jeu, depuis une saisie libre (« Bold », 600, "700"), ou undefined quand le
 * jeu n'en a pas ou que la saisie est illisible. Phosphor ↔ Material : graisses converties.
 */
export function normalizeIconWeight(set: IconSet, raw: unknown): IconWeight | undefined {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : null
  const n = typeof raw === 'number' ? raw : text && /^\d+$/.test(text) ? Number(text) : null
  if (set === 'phosphor') {
    if (text && (PHOSPHOR_WEIGHTS as readonly string[]).includes(text)) return text as PhosphorWeight
    if (text === 'normal') return 'regular'
    if (text === 'filled') return 'fill'
    return n !== null && Number.isFinite(n) ? phosphorWeightFor(n) : undefined
  }
  if (set === 'material-rounded') {
    if (n !== null && Number.isFinite(n)) return materialWeightFor(n)
    const named = PHOSPHOR_NUMERIC.find(([w]) => w === (text === 'normal' ? 'regular' : text))
    return named?.[1]
  }
  return undefined
}

/** Le jeu a-t-il des variantes (`weight`) ? */
export const hasWeights = (set: IconSet): boolean => set === 'phosphor' || set === 'material-rounded'
/** Le jeu est-il dessiné au trait (`strokeWidth` utile) ? */
export const isStrokeSet = (set: IconSet): boolean => set === 'lucide' || set === 'feather'

// ——— Noms de jeux (saisies libres, Pen) ———

const LIBRARIES: Record<string, IconSet> = {
  lucide: 'lucide',
  phosphor: 'phosphor',
  ph: 'phosphor',
  feather: 'feather',
  materialrounded: 'material-rounded',
  materialsymbolsrounded: 'material-rounded',
  material: 'material-rounded',
  materialsymbols: 'material-rounded',
}

/** Jeu nommé librement (« Material Symbols Rounded », « Phosphor », « material-rounded »), ou null. */
export function toIconSet(raw: unknown): IconSet | null {
  if (typeof raw !== 'string') return null
  return LIBRARIES[raw.toLowerCase().replace(/[^a-z]/g, '')] ?? null
}

/**
 * Correspondance d'une icône Pen (`library`, `weight` numérique de 100 à 700) avec le modèle :
 * le jeu et, pour Phosphor et Material, la variante la plus proche. Sans graisse : variante par
 * défaut (pas de `weight`). Bibliothèque inconnue (Material Outlined ou Sharp compris) : null.
 */
export function penIconSet(library: string, weight?: number): { set: IconSet; weight?: IconWeight } | null {
  const set = toIconSet(library)
  if (!set) return null
  const w = weight !== undefined && Number.isFinite(weight) ? normalizeIconWeight(set, weight) : undefined
  return w === undefined ? { set } : { set, weight: w }
}
