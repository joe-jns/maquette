import { ipcMain, nativeImage } from 'electron'
import type { ImageCredit, ImageHit, ImagePlace, ImageSearch } from '../shared/images'
import { readCredits, saveFound } from './imageCredits'
import {
  DEFAULT_APIS, download, fetchRecord, imageSize, licenceLabel, searchImages, webSized,
  type Fetch, type FoundImage, type ImageApis,
} from './imageSources'
import { getAssetDir } from './state'

/** Une photo posée ne dépasse pas cette largeur : assez pour un écran large en 2x, sans alourdir le dossier. */
const MAX_PLACE_WIDTH = 2400
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
const MAX_THUMB_BYTES = 600 * 1024
const THUMB_TIMEOUT_MS = 8000

/** Tests : MAQUETTE_IMAGES_API remplace les deux sources par un faux serveur local. */
function apis(): ImageApis {
  const fake = process.env.MAQUETTE_IMAGES_API
  return fake ? { openverse: fake, commons: fake } : DEFAULT_APIS
}
const net: Fetch = (url, init) => fetch(url, init)

/** Réfs de la dernière recherche, dans l'ordre de la planche : `poser: 3` vise la troisième. */
let lastRefs: string[] = []

async function thumbOf(it: FoundImage): Promise<Uint8Array | null> {
  if (!it.thumb) return null
  try {
    return (await download(net, it.thumb, MAX_THUMB_BYTES, THUMB_TIMEOUT_MS)).bytes
  } catch {
    return null
  }
}

export async function search(query: string, n: number, withThumbs: boolean): Promise<ImageSearch> {
  try {
    // Quelques résultats de réserve : ceux dont la vignette ne charge pas sont écartés.
    const { items, failed } = await searchImages(query, withThumbs ? n + 4 : n, { fetch: net, apis: apis() })
    const notes = failed.map((f) => `${f.source} injoignable (${f.reason})`)
    if (!items.length) {
      return { ok: false, message: `aucune photo libre pour « ${query} » : moins de mots, des mots anglais simples (« bakery bread », « wood oven »), ou le nom du lieu${notes.length ? ` — ${notes.join(' ; ')}` : ''}` }
    }
    let kept = items.map((it) => ({ it, thumb: null as Uint8Array | null }))
    if (withThumbs) {
      const thumbs = await Promise.all(items.map(thumbOf))
      kept = items.map((it, i) => ({ it, thumb: thumbs[i] ?? null }))
      const loaded = kept.filter((k) => k.thumb)
      kept = (loaded.length ? loaded : kept).slice(0, n)
    }
    lastRefs = kept.map((k) => k.it.ref)
    const hits: ImageHit[] = kept.map(({ it }, i) => ({
      n: i + 1, ref: it.ref, title: it.title, creator: it.creator, licence: licenceLabel(it), width: it.width, height: it.height, thumb: it.thumb,
    }))
    return { ok: true, hits, thumbs: kept.map((k) => k.thumb), notes }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

/** Réduit une photo trop large (JPEG et PNG ; les autres formats restent tels quels). */
function shrink(file: { bytes: Uint8Array; ext: string }): { bytes: Uint8Array; ext: string; width: number; height: number } {
  const size = imageSize(file.bytes)
  if (file.ext === 'jpg' || file.ext === 'png') {
    const img = nativeImage.createFromBuffer(Buffer.from(file.bytes))
    if (!img.isEmpty()) {
      const { width, height } = img.getSize()
      if (width > MAX_PLACE_WIDTH) {
        const small = img.resize({ width: MAX_PLACE_WIDTH, quality: 'best' })
        const s = small.getSize()
        return { bytes: file.ext === 'png' ? small.toPNG() : small.toJPEG(85), ext: file.ext, width: s.width, height: s.height }
      }
      return { ...file, width, height }
    }
  }
  if (!size) throw new Error('image illisible')
  return { ...file, ...size }
}

export async function place(ref: string | number): Promise<ImagePlace> {
  const dir = getAssetDir()
  if (!dir) return { ok: false, message: 'dossier des images indisponible' }
  const wanted = typeof ref === 'number' || /^\d+$/.test(ref) ? lastRefs[Number(ref) - 1] : ref
  if (!wanted) return { ok: false, message: `pas de résultat n°${ref} dans la dernière recherche` }
  try {
    // Délais cumulés sous les 30 s d'un appel d'outil : fiche 7 s, version web 5 s, fichier 15 s.
    const record = await fetchRecord(wanted, { fetch: net, apis: apis(), timeoutMs: 7000 })
    const it = await webSized(record, { fetch: net, apis: apis(), timeoutMs: 5000 })
    const file = shrink(await download(net, it.image, MAX_DOWNLOAD_BYTES, 15_000))
    const { src, entry } = await saveFound(dir, it, file)
    return { ok: true, src, width: file.width, height: file.height, title: it.title, credit: entry.credit }
  } catch (e) {
    return { ok: false, message: `${wanted} : ${(e as Error).message}` }
  }
}

export async function credits(): Promise<ImageCredit[]> {
  const dir = getAssetDir()
  if (!dir) return []
  return (await readCredits(dir)).map((c) => ({ file: c.file, credit: c.credit, page: c.page, licenseUrl: c.licenseUrl }))
}

export function registerImageIpc(): void {
  ipcMain.handle('images:search', (_e, args: { query: string; n: number; thumbs: boolean }) =>
    search(String(args.query), Math.max(1, Math.min(12, Number(args.n) || 6)), Boolean(args.thumbs)),
  )
  ipcMain.handle('images:place', (_e, ref: string | number) => place(ref))
  ipcMain.handle('images:credits', () => credits())
}
