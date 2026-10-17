/** Écran d'accueil (fichiers récents) : types échangés avec le principal et logique pure. */

/** Un fichier récent, tel que l'accueil l'affiche. */
export interface RecentEntry {
  path: string
  /** Nom sans dossier ni extension. */
  name: string
  /** Dossier abrégé (« ~\Documents\Sites », « …\Clients\Dupont »). */
  folder: string
  /** Dernière modification du fichier (ms), null s'il est introuvable. */
  modified: number | null
  missing: boolean
  /** Aperçu : empreinte du chemin (40 caractères hexadécimaux) et date de l'image, ou null. */
  thumb: { hash: string; version: number } | null
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const dayStart = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** « modifié à l'instant », « il y a 12 min », « il y a 2 h », « hier », « le 3 octobre » (année si autre). */
export function relativeDate(t: number, now: number): string {
  const min = Math.floor((now - t) / 60_000)
  if (min < 1) return 'modifié à l’instant'
  if (min < 60) return `modifié il y a ${min} min`
  const today = dayStart(now)
  if (t >= today) return `modifié il y a ${Math.floor(min / 60)} h`
  const yesterday = dayStart(today - 1)
  if (t >= yesterday) return 'modifié hier'
  const d = new Date(t)
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`
  return `modifié le ${d.getDate() === 1 ? '1er' : d.getDate()} ${MONTHS[d.getMonth()]}${year}`
}

/** Sans accents ni majuscules, pour chercher « ete » dans « Été ». */
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Fichiers dont le nom contient la recherche (sans tenir compte des accents ni de la casse). */
export function filterEntries(list: RecentEntry[], query: string): RecentEntry[] {
  const q = fold(query.trim())
  return q ? list.filter((e) => fold(e.name).includes(q)) : list
}

/** Le plus récemment modifié d'abord ; les fichiers introuvables à la fin ; sinon l'ordre des récents. */
export function sortEntries(list: RecentEntry[]): RecentEntry[] {
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ta = a.e.modified ?? -Infinity
      const tb = b.e.modified ?? -Infinity
      return ta === tb ? a.i - b.i : tb - ta
    })
    .map(({ e }) => e)
}

/**
 * Dossier lisible : le dossier personnel devient « ~ », et un chemin profond ne garde que ses deux
 * derniers dossiers (« …\Clients\Dupont »).
 */
export function shortFolder(dir: string, home: string, sep: '\\' | '/' = '\\'): string {
  const norm = (s: string) => s.replace(/[\\/]+$/, '')
  const d = norm(dir)
  const h = norm(home)
  const same = sep === '\\' ? d.toLowerCase().startsWith(h.toLowerCase()) : d.startsWith(h)
  let shown = d
  if (h && same && (d.length === h.length || d[h.length] === '\\' || d[h.length] === '/')) shown = `~${d.slice(h.length)}`
  const parts = shown.split(/[\\/]+/).filter(Boolean)
  if (parts.length <= 3) return shown || sep
  return `…${sep}${parts.slice(-2).join(sep)}`
}

/** Carte suivante au clavier dans une grille de `columns` colonnes (flèches, Début, Fin). */
export function gridMove(index: number, key: string, columns: number, count: number): number {
  if (count === 0) return -1
  const cols = Math.max(1, columns)
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i))
  switch (key) {
    case 'ArrowRight': return clamp(index + 1)
    case 'ArrowLeft': return clamp(index - 1)
    case 'ArrowDown': return index + cols < count ? index + cols : index
    case 'ArrowUp': return index - cols >= 0 ? index - cols : index
    case 'Home': return 0
    case 'End': return count - 1
    default: return index
  }
}

/** Empreinte d'aperçu valable : exactement 40 caractères hexadécimaux (rien d'un chemin). */
export const isThumbHash = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{40}$/.test(s)
