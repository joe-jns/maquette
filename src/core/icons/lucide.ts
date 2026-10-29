import TAGS from 'lucide-static/tags.json'
import ALIASES from './lucideAliases.json'
import { rankIcons } from './search'

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

/**
 * Icônes qui correspondent à une recherche (anglais, ou français courant : « flèche droite »,
 * « panier »). Tous les mots doivent correspondre (au nom ou aux étiquettes Lucide). Les noms
 * exacts et les noms qui commencent par le mot passent devant.
 */
export function searchIcons(query: string, limit = 40): string[] {
  return rankIcons(ICON_NAMES, (name) => TAG_MAP[name] ?? [], query, resolveIcon(query), limit)
}

/** Étiquettes Lucide d'une icône (servent aussi aux noms Feather, qui en descendent). */
export const lucideTags = (name: string): readonly string[] => TAG_MAP[name] ?? []
