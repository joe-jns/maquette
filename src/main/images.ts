import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024
const EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'])

/**
 * Copie une image dans le dossier assets/ du document, sous un nom tiré de son empreinte SHA-256 :
 * la même image importée deux fois ne fait qu'un fichier. Renvoie le chemin relatif au document.
 */
export async function importImage(docDir: string, name: string, bytes: Uint8Array): Promise<{ src: string }> {
  const ext = extname(name).slice(1).toLowerCase()
  if (!EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported image format: ${ext ? `.${ext}` : 'no extension'}`)
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Image too large (50 MB max)')

  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  const file = `${hash}.${ext}`
  await mkdir(join(docDir, 'assets'), { recursive: true })
  try {
    await writeFile(join(docDir, 'assets', file), bytes, { flag: 'wx' })
  } catch (e) {
    // Déjà présente : même empreinte, même contenu.
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
  }
  return { src: `assets/${file}` }
}
