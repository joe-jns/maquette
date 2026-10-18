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

/** maquette-chat://img/<hash>.jpg → vignette du dossier `dir`, rien d'autre. */
export function handleChatImages(dir: string): void {
  protocol.handle(CHAT_IMAGE_SCHEME, async (request) => {
    const url = new URL(request.url)
    const file = url.host === 'img' ? imageFile(dir, url.pathname) : null
    if (!file) return new Response('introuvable', { status: 404 })
    try {
      const body = await readFile(file)
      return new Response(new Uint8Array(body), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'max-age=31536000, immutable' } })
    } catch {
      return new Response('introuvable', { status: 404 })
    }
  })
}
