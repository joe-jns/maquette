import { app, nativeImage, protocol, type CustomScheme } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CHAT_IMAGE_SCHEME } from '../../shared/chat'
import { imageFile, thumbScale, type MakeThumb } from './chatImages'

/** Déclaré avec les autres protocoles, en un seul appel à registerSchemesAsPrivileged (index.ts). */
export const CHAT_IMAGE_SCHEME_DEF: CustomScheme = {
  scheme: CHAT_IMAGE_SCHEME,
  privileges: { standard: true, secure: true },
}

/** Dossier des vignettes du chat. */
export const chatImagesDir = (): string => join(app.getPath('userData'), 'chat-images')

/** Vignette JPEG (qualité 80) d'une image PNG ou JPEG, réduite à 640 px de large au plus. */
export const nativeThumb: MakeThumb = (bytes) => {
  const image = nativeImage.createFromBuffer(bytes)
  if (image.isEmpty()) return null
  const size = image.getSize()
  if (!size.width || !size.height) return null
  const scale = thumbScale(size.width, size.height)
  const small =
    scale < 1 ? image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'good' }) : image
  const out = small.getSize()
  return { jpeg: small.toJPEG(80), width: out.width, height: out.height }
}

/** Vignette du sélecteur de styles : un nom de fichier .webp simple, dans `dir` (vendor/design/thumbs). */
export function styleThumbFile(dir: string, pathname: string): string | null {
  const name = decodeURIComponent(pathname.replace(/^\//, ''))
  return STYLE_THUMB.test(name) ? join(dir, name) : null
}
const STYLE_THUMB = /^[a-z0-9][a-z0-9-]{0,120}\.webp$/

/**
 * maquette-chat://img/<hash>.jpg → vignette du dossier `dir` ;
 * maquette-chat://style/<nom>.webp → vignette du sélecteur de styles (`thumbs`) ; rien d'autre.
 */
export function handleChatImages(dir: string, thumbs: string): void {
  protocol.handle(CHAT_IMAGE_SCHEME, async (request) => {
    const url = new URL(request.url)
    const file = url.host === 'img' ? imageFile(dir, url.pathname) : url.host === 'style' ? styleThumbFile(thumbs, url.pathname) : null
    if (!file) return new Response('introuvable', { status: 404 })
    try {
      const body = await readFile(file)
      const type = url.host === 'style' ? 'image/webp' : 'image/jpeg'
      return new Response(new Uint8Array(body), { headers: { 'content-type': type, 'cache-control': 'max-age=31536000, immutable' } })
    } catch {
      return new Response('introuvable', { status: 404 })
    }
  })
}
