import { dirname, resolve } from 'node:path'

/**
 * Le document ouvert, vu du processus principal. Un fichier lu sur disque n'est que « proposé » à la
 * fenêtre ; il ne devient courant (dossier des images, cible d'« Enregistrer ») qu'une fois accepté.
 */
let currentPath: string | null = null
const offered = new Set<string>()

const key = (path: string) => (process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path))

export function resetSession(): void {
  currentPath = null
  offered.clear()
}

/** Un fichier vient d'être lu sur disque pour la fenêtre (argument de lancement, boîte « Ouvrir »). */
export function offerPath(path: string): void {
  offered.add(key(path))
}

/** La fenêtre a chargé ce fichier (ou un nouveau document : null). Refusé s'il ne lui a pas été proposé. */
export function acceptPath(path: string | null): boolean {
  if (path === null) {
    currentPath = null
    return true
  }
  if (!offered.has(key(path))) return false
  currentPath = resolve(path)
  return true
}

/** Le seul chemin où « Enregistrer » écrit sans boîte de dialogue : le document courant. */
export function allowedSavePath(requested: string | null): string | null {
  if (!requested || !currentPath) return null
  return key(requested) === key(currentPath) ? currentPath : null
}

/** Un enregistrement vient d'écrire ce fichier : il devient le document courant. */
export function savedTo(path: string): void {
  offerPath(path)
  currentPath = resolve(path)
}

export function getCurrentDir(): string | null {
  return currentPath ? dirname(currentPath) : null
}
