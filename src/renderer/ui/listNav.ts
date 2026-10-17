/** Navigation clavier d'une liste d'options (fonctions pures, testées à part). */

export interface NavItem {
  label: string
  disabled?: boolean
}

/**
 * Option suivante (`step` = +1) ou précédente (−1) qui n'est pas désactivée, sans boucler.
 * Depuis `-1` (rien d'actif), +1 donne la première option possible et −1 la dernière.
 * Renvoie `from` s'il n'y a rien plus loin.
 */
export function stepIndex(items: readonly NavItem[], from: number, step: 1 | -1): number {
  if (from < 0) return step === 1 ? edgeIndex(items, 'first') : edgeIndex(items, 'last')
  for (let i = from + step; i >= 0 && i < items.length; i += step) if (!items[i]!.disabled) return i
  return from
}

/** Première ou dernière option possible ; `-1` si toutes sont désactivées. */
export function edgeIndex(items: readonly NavItem[], edge: 'first' | 'last'): number {
  if (edge === 'first') return items.findIndex((it) => !it.disabled)
  for (let i = items.length - 1; i >= 0; i--) if (!items[i]!.disabled) return i
  return -1
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/**
 * Saisie de lettres pour sauter : la première option possible dont le libellé commence par `query`
 * (sans accents ni casse), en cherchant après `from` puis en reprenant au début. Une même lettre
 * répétée (« b », « bb ») passe d'une option à la suivante qui commence par elle.
 */
export function matchIndex(items: readonly NavItem[], query: string, from: number): number {
  const q = fold(query)
  if (!q) return -1
  const repeated = q.length > 1 && [...q].every((c) => c === q[0])
  const needle = repeated ? q[0]! : q
  // Une recherche qui s'allonge (« bo » après « b ») peut garder l'option actuelle.
  const start = repeated || q.length === 1 ? from + 1 : Math.max(from, 0)
  for (let k = 0; k < items.length; k++) {
    const i = (((start + k) % items.length) + items.length) % items.length
    const it = items[i]!
    if (!it.disabled && fold(it.label).startsWith(needle)) return i
  }
  return -1
}

export interface Box { left: number; top: number; width: number; height: number }

/**
 * Place une liste flottante près de son champ, toujours entière dans la fenêtre (marge `margin`).
 * Avec `selectedCenter` (centre vertical de l'option choisie, mesuré depuis le haut de la liste),
 * la liste s'ouvre comme chez Figma : l'option choisie posée sur le champ. Sinon, collée dessous.
 * Si elle est plus haute que la fenêtre, `maxHeight` la limite (elle défile).
 */
export function placeList(
  anchor: Box,
  menu: { width: number; height: number },
  selectedCenter: number | null,
  viewport: { width: number; height: number },
  margin = 8,
): { left: number; top: number; maxHeight: number } {
  const maxHeight = Math.max(0, viewport.height - 2 * margin)
  const height = Math.min(menu.height, maxHeight)
  const wanted = selectedCenter === null ? anchor.top + anchor.height + 4 : anchor.top + anchor.height / 2 - selectedCenter
  const top = Math.min(Math.max(wanted, margin), viewport.height - margin - height)
  const left = Math.min(Math.max(anchor.left, margin), Math.max(margin, viewport.width - margin - menu.width))
  return { left: Math.round(left), top: Math.round(top), maxHeight }
}
