import { join } from 'node:path'

const FONT_FILE = /^[0-9a-f]{16}\.woff2$/

/** Chemin absolu d'un fichier de police du cache, ou null si le nom n'est pas une empreinte + .woff2. */
export function resolveFontFile(dir: string, name: string): string | null {
  return FONT_FILE.test(name) ? join(dir, 'files', name) : null
}
