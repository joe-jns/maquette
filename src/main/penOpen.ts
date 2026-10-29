import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { serializeDocument } from '../core/format'
import { importPen, parsePenText, penImageUrls } from '../core/pen/importPen'
import type { OpenedFile } from '../shared/ipc'
import { importImage } from './images'
import { download, type Fetch } from './imageSources'
import { getPendingDir, offerImport } from './state'

/**
 * Ouvrir un .pen : le fichier est LU seulement (jamais écrit, déplacé ni renommé), converti en
 * document Maquette sans fichier. Ses images (chemins relatifs au .pen, ou adresses web) sont copiées
 * dans le dossier d'attente du lancement, sous un `src` « assets/… » : elles suivent le document au
 * premier enregistrement, comme toute image d'un document sans titre.
 */

export const isPenPath = (path: string): boolean => path.toLowerCase().endsWith('.pen')
/** Fichier que Maquette sait ouvrir : .maquette ou .pen. */
export const isOpenablePath = (path: string): boolean => /\.(maquette|pen)$/i.test(path)

/** Nom du document converti : celui du .pen, sans extension. */
export const penDocName = (penPath: string): string => basename(penPath).replace(/\.pen$/i, '')

/** Chemin proposé par « Enregistrer » pour un .pen converti : `<nom>.maquette` dans le dossier du .pen. */
export function saveDefaultPath(importedFrom: string | null): string {
  if (!importedFrom) return 'Untitled.maquette'
  return join(dirname(importedFrom), `${penDocName(importedFrom)}.maquette`)
}

/** Chemin choisi dans la boîte « Enregistrer » : toujours en .maquette (« x.pen » devient « x.pen.maquette »). */
export const withMaquetteExt = (path: string): string => (path.toLowerCase().endsWith('.maquette') ? path : `${path}.maquette`)

/** Images web d'un .pen : 25 Mo et 15 s au plus chacune. */
const MAX_WEB_BYTES = 25 * 1024 * 1024
const WEB_TIMEOUT_MS = 15_000
const PARALLEL = 6
const net: Fetch = (url, init) => fetch(url, init)

const MAGIC: [number[], string][] = [
  [[0x89, 0x50, 0x4e, 0x47], 'png'],
  [[0xff, 0xd8, 0xff], 'jpg'],
  [[0x47, 0x49, 0x46], 'gif'],
  [[0x52, 0x49, 0x46, 0x46], 'webp'],
]
/** Extension d'une image : celle du nom si connue, sinon lue dans ses premiers octets. */
function extOf(name: string, bytes: Uint8Array): string {
  const ext = extname(name).slice(1).toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return ext
  const hit = MAGIC.find(([m]) => m.every((b, i) => bytes[i] === b))
  if (hit) return hit[1]
  return /<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0, 512))) ? 'svg' : 'png'
}

/** Fichier local d'une image du .pen (relative au .pen, éventuellement encodée). */
async function readLocal(penDir: string, url: string): Promise<Uint8Array> {
  const clean = url.replace(/^file:\/\/\/?/i, '').split(/[?#]/)[0]!
  const tries = [clean]
  try {
    const decoded = decodeURIComponent(clean)
    if (decoded !== clean) tries.push(decoded)
  } catch { /* nom déjà lisible */ }
  let last: unknown = null
  for (const t of tries) {
    try {
      return new Uint8Array(await readFile(isAbsolute(t) ? t : resolve(penDir, t)))
    } catch (e) {
      last = e
    }
  }
  throw last instanceof Error ? last : new Error('image introuvable')
}

/** Copie chaque image du .pen dans `assetDir` ; url → `src`, absente si l'image n'a pas pu être lue. */
export async function preparePenImages(penPath: string, urls: string[], assetDir: string, f: Fetch = net): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const penDir = dirname(penPath)
  const queue = [...urls]
  const worker = async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      try {
        let bytes: Uint8Array
        let name: string
        if (/^(https?:|data:image\/)/i.test(url)) {
          const file = await download(f, url, MAX_WEB_BYTES, WEB_TIMEOUT_MS)
          bytes = file.bytes
          name = `image.${file.ext}`
        } else {
          bytes = await readLocal(penDir, url)
          name = `image.${extOf(url, bytes)}`
        }
        out.set(url, (await importImage(assetDir, name, bytes)).src)
      } catch {
        // Image absente ou illisible : comptée dans le rapport par la conversion.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, urls.length) }, worker))
  return out
}

/** Lit un .pen et le convertit pour la fenêtre (document sans fichier + rapport). */
export async function readPenForWindow(penPath: string, f: Fetch = net): Promise<OpenedFile> {
  const absolute = resolve(penPath)
  const json = parsePenText(await readFile(absolute, 'utf8'))
  const assetDir = getPendingDir()
  const images = assetDir ? await preparePenImages(absolute, penImageUrls(json), assetDir, f) : new Map<string, string>()
  const { doc, report } = importPen(json, { image: (url) => images.get(url) ?? null })
  offerImport(absolute)
  return {
    path: null,
    text: serializeDocument(doc),
    imported: { from: absolute, name: penDocName(absolute), report: report.items },
  }
}
