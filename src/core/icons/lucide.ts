import TAGS from 'lucide-static/tags.json'
import ALIASES from './lucideAliases.json'
import { FRENCH } from './french'

/**
 * Jeu d'icônes Lucide (lucide-static, licence ISC) : noms, anciens noms, recherche.
 * Les tracés sont lus par le rendu (renderer/canvas/IconSvg.tsx) ; ce module reste léger et pur.
 */

export const ICON_SET = 'lucide'
/** Icône dessinée à la place d'un nom inconnu. */
export const FALLBACK_ICON = 'circle-question-mark'

const TAG_MAP = TAGS as Record<string, string[]>
const ALIAS_MAP = ALIASES as Record<string, string>
export const ICON_NAMES: readonly string[] = Object.keys(TAG_MAP).sort()
const NAMES = new Set(ICON_NAMES)

export const isIconName = (name: string): boolean => NAMES.has(name)

/** « lucide:ArrowRight », « arrowRight », « arrow_right », « ArrowRightIcon » → « arrow-right ». */
export function iconKey(raw: string): string {
  return raw
    .trim()
    .replace(/^(?:lucide|lucide-icons?|icons?)\s*[:/]\s*/i, '')
    .replace(/(?<=[a-z0-9])Icon$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Nom d'icône du jeu pour une saisie libre : nom exact, écrit autrement (casse, préfixe), ancien nom
 * Lucide/Feather (« home » → « house »), ou sans suffixe numérique (« trash-2 » → « trash »). Sinon null.
 */
export function resolveIcon(raw: string): string | null {
  const key = iconKey(raw)
  const tries = [key, key.replace(/-icon$/, ''), key.replace(/-\d+$/, '')]
  for (const k of tries) {
    if (NAMES.has(k)) return k
    const alias = ALIAS_MAP[k]
    if (alias && NAMES.has(alias)) return alias
  }
  return null
}

// ——— Recherche ———

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Mots cherchés : le mot, sa traduction anglaise (français courant), son singulier. */
function variants(word: string): string[] {
  const out = new Set([word])
  const singular = word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : null
  for (const w of [word, singular]) {
    if (!w) continue
    out.add(w)
    for (const en of FRENCH[w] ?? []) out.add(en)
  }
  return [...out]
}

function wordScore(name: string, parts: string[], tags: string[], word: string): number {
  if (name === word) return 100
  if (parts.includes(word)) return 60
  if (name.startsWith(word)) return 45
  if (tags.includes(word)) return 35
  if (name.includes(word)) return 25
  if (tags.some((t) => t.split(/[\s-]+/).includes(word))) return 20
  if (word.length >= 4 && tags.some((t) => t.includes(word))) return 10
  return 0
}

/**
 * Icônes qui correspondent à une recherche (anglais, ou français courant : « flèche droite »,
 * « panier »). Tous les mots doivent correspondre (au nom ou aux étiquettes Lucide). Les noms
 * exacts et les noms qui commencent par le mot passent devant.
 */
export function searchIcons(query: string, limit = 40): string[] {
  const words = fold(query).split(/[\s,;/]+/).map((w) => w.replace(/^-+|-+$/g, '')).filter(Boolean)
  if (words.length === 0) return ICON_NAMES.slice(0, limit)
  const direct = resolveIcon(query)
  const scored: { name: string; score: number }[] = []
  for (const name of ICON_NAMES) {
    const parts = name.split('-')
    const tags = TAG_MAP[name] ?? []
    let total = 0
    for (const word of words) {
      let best = 0
      for (const v of variants(word)) best = Math.max(best, wordScore(name, parts, tags, v))
      if (best === 0) {
        total = 0
        break
      }
      total += best
    }
    if (name === direct) total += 1000
    if (total > 0) scored.push({ name, score: total })
  }
  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
  return scored.slice(0, limit).map((s) => s.name)
}
