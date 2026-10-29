import { FRENCH } from './french'

/**
 * Recherche commune aux jeux d'icônes : mots anglais ou français courants, tous les mots doivent
 * correspondre au nom ou aux étiquettes de l'icône. Les noms exacts et les noms qui commencent par
 * le mot passent devant.
 */

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

function wordScore(name: string, parts: string[], tags: readonly string[], word: string): number {
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
 * Icônes de `names` qui correspondent à `query`, les meilleures d'abord. `direct` (nom résolu de la
 * saisie) passe en tête. Les noms Material (snake_case) sont comparés en kebab-case, comme les
 * traductions françaises (« shopping-cart »).
 */
export function rankIcons(
  names: readonly string[],
  tagsOf: (name: string) => readonly string[],
  query: string,
  direct: string | null,
  limit: number,
): string[] {
  const words = fold(query).split(/[\s,;/]+/).map((w) => w.replace(/^-+|-+$/g, '')).filter(Boolean)
  if (words.length === 0) return names.slice(0, limit)
  const scored: { name: string; score: number }[] = []
  for (const name of names) {
    const key = name.replace(/_/g, '-')
    const parts = key.split('-')
    const tags = tagsOf(name)
    let total = 0
    for (const word of words) {
      let best = 0
      for (const v of variants(word)) best = Math.max(best, wordScore(key, parts, tags, v))
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
