import { resolve, sep } from 'node:path'

/** Chemin absolu d'une image du document, ou null si l'URL sort du dossier du document. */
export function resolveAssetPath(baseDir: string, urlPath: string): string | null {
  let relative: string
  try {
    relative = decodeURIComponent(urlPath).replace(/^\/+/, '')
  } catch {
    return null
  }
  if (!relative) return null
  const root = resolve(baseDir)
  const absolute = resolve(root, relative)
  return absolute.startsWith(root + sep) ? absolute : null
}
