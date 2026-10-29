import { dirname, resolve } from 'node:path'

/**
 * Le document ouvert, vu du processus principal. Un fichier lu sur disque n'est que « proposé » à la
 * fenêtre ; il ne devient courant (dossier des images, cible d'« Enregistrer ») qu'une fois accepté.
 */
let currentPath: string | null = null
const offered = new Set<string>()

const key = (path: string) => (process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path))

/** .pen converti affiché (document sans fichier) : « Enregistrer » propose un .maquette à côté de lui. */
let importedFrom: string | null = null
const offeredImports = new Set<string>()

export function resetSession(): void {
  currentPath = null
  importedFrom = null
  offered.clear()
  offeredImports.clear()
}

/** Un .pen vient d'être lu et converti pour la fenêtre. */
export function offerImport(penPath: string): void {
  offeredImports.add(key(penPath))
}

/** Le .pen d'origine du document affiché (sans fichier), ou null. */
export function getImportedFrom(): string | null {
  return importedFrom
}

/** Un fichier vient d'être lu sur disque pour la fenêtre (argument de lancement, boîte « Ouvrir »). */
export function offerPath(path: string): void {
  offered.add(key(path))
}

/** La fenêtre a chargé ce fichier (ou un nouveau document : null). Refusé s'il ne lui a pas été proposé. */
export function acceptPath(path: string | null, fromPen?: string | null): boolean {
  importedFrom = null
  if (path === null) {
    currentPath = null
    // Document converti d'un .pen : seulement un .pen réellement lu pour la fenêtre.
    if (fromPen && offeredImports.has(key(fromPen))) importedFrom = resolve(fromPen)
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
  importedFrom = null
}

export function getCurrentDir(): string | null {
  return currentPath ? dirname(currentPath) : null
}

export function getCurrentPath(): string | null {
  return currentPath
}

/** Dossier des images d'un document jamais enregistré (userData/pending-assets/<lancement>). */
let pendingDir: string | null = null

export function setPendingDir(dir: string | null): void {
  pendingDir = dir
}

/** Dossier d'attente des images des documents sans fichier (un .pen converti y met les siennes). */
export function getPendingDir(): string | null {
  return pendingDir
}

/**
 * Dossier où vivent les images du document affiché : celui du fichier, sinon le dossier temporaire
 * du lancement (recopié dans le dossier du fichier au premier enregistrement).
 */
export function getAssetDir(): string | null {
  return getCurrentDir() ?? pendingDir
}
