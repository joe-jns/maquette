import { app, nativeImage } from 'electron'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseDocument } from '../core/format'
import { isThumbHash } from '../shared/home'
import { renderNode } from './exportPng'
import { writeBytesAtomic } from './files'
import { getCurrentPath } from './state'
import { THUMB_WIDTH, thumbCropHeight, thumbHash, thumbnailTarget } from './thumbModel'

/**
 * Aperçus de l'accueil : une image JPEG par fichier récent, dans `<userData>/thumbs/<empreinte>.jpg`.
 * Rendue par la fenêtre cachée de l'export, jamais écrite dans le fichier .maquette ; un échec ne
 * gêne rien (l'accueil montre alors une vignette vide).
 */
const thumbDir = () => join(app.getPath('userData'), 'thumbs')
const thumbFile = (hash: string) => join(thumbDir(), `${hash}.jpg`)

/** Dernier texte à rendre par fichier : plusieurs enregistrements pendant un rendu n'en relancent qu'un. */
const waiting = new Map<string, string>()
const running = new Set<string>()
/** À l'ouverture : rendu différé (le document vient d'arriver, l'affichage passe d'abord). */
const OPEN_DELAY_MS = 2500
let openTimer: ReturnType<typeof setTimeout> | null = null

/** Refait l'aperçu de ce fichier (après un enregistrement réussi). Ne lève jamais. */
export function updateThumb(path: string, text: string): void {
  const hash = thumbHash(path)
  waiting.set(hash, text)
  if (!running.has(hash)) void drain(hash)
}

/** Fichier ouvert sans aperçu : on le fait un peu plus tard, s'il est toujours le document affiché. */
export function ensureThumb(path: string, text: string): void {
  if (openTimer) clearTimeout(openTimer)
  openTimer = setTimeout(() => {
    openTimer = null
    const current = getCurrentPath()
    if (!current || thumbHash(current) !== thumbHash(path)) return
    void stat(thumbFile(thumbHash(path))).then(
      () => undefined,
      () => updateThumb(path, text),
    )
  }, OPEN_DELAY_MS)
}

async function drain(hash: string): Promise<void> {
  running.add(hash)
  try {
    for (let text = waiting.get(hash); text !== undefined; text = waiting.get(hash)) {
      waiting.delete(hash)
      await render(hash, text).catch(() => undefined)
    }
  } finally {
    running.delete(hash)
  }
}

async function render(hash: string, text: string): Promise<void> {
  const parsed = parseDocument(text)
  if (!parsed.ok) return
  const target = thumbnailTarget(parsed.doc)
  if (!target) {
    // Page vidée : l'ancien aperçu ne correspond plus à rien.
    await rm(thumbFile(hash), { force: true })
    return
  }
  const r = await renderNode(target.doc, target.nodeId, { scale: 4, format: 'jpeg', maxWidth: THUMB_WIDTH })
  if (!r) return
  let image = nativeImage.createFromBuffer(r.buffer)
  if (image.isEmpty()) return
  const { width, height } = image.getSize()
  const keep = thumbCropHeight(width, height, target.designWidth)
  if (keep < height) image = image.crop({ x: 0, y: 0, width, height: keep })
  await mkdir(thumbDir(), { recursive: true })
  await writeBytesAtomic(thumbFile(hash), image.toJPEG(82))
}

/** Aperçu existant d'un fichier : son empreinte et la date de l'image (pour rafraîchir l'affichage). */
export async function thumbInfo(path: string): Promise<{ hash: string; version: number } | null> {
  const hash = thumbHash(path)
  try {
    return { hash, version: Math.round((await stat(thumbFile(hash))).mtimeMs) }
  } catch {
    return null
  }
}

/** L'image d'un aperçu en data URL ; rien pour une empreinte mal formée (pas de chemin accepté). */
export async function thumbDataUrl(hash: unknown): Promise<string | null> {
  if (!isThumbHash(hash)) return null
  const file = thumbFile(hash)
  // Ceinture et bretelles : le fichier lu est bien dans le dossier des aperçus.
  if (!resolve(file).startsWith(resolve(thumbDir()))) return null
  try {
    return `data:image/jpeg;base64,${(await readFile(file)).toString('base64')}`
  } catch {
    return null
  }
}

/** Fichier retiré des récents : son aperçu part avec lui. */
export async function removeThumb(path: string): Promise<void> {
  waiting.delete(thumbHash(path))
  await rm(thumbFile(thumbHash(path)), { force: true }).catch(() => undefined)
}
