import { clipboard, ipcMain } from 'electron'
import type { ClipboardContent, ImageImport } from '../shared/ipc'
import { importImage } from './images'
import { download, type Fetch } from './imageSources'
import { getAssetDir } from './state'

/** Une image de référence collée ou glissée depuis le web : 25 Mo et 15 s au plus. */
const MAX_WEB_BYTES = 25 * 1024 * 1024
const WEB_TIMEOUT_MS = 15_000

interface Source { content(): Promise<ClipboardContent>; png(): Promise<Buffer | null> }

const PNG = 'image/png'

/** Contenu d'un type du presse-papiers (W3C, Electron 44), ou null s'il n'y est pas. */
async function blobOf(type: string): Promise<Blob | null> {
  for (const item of await clipboard.read()) {
    if (item.types.includes(type)) return (await item.getType(type)) as Blob
  }
  return null
}

/**
 * Le presse-papiers du système ; pendant les tests de bout en bout, un presse-papiers simulé
 * (`globalThis.__maquetteFakeClipboard`, rempli par le test) : celui de l'utilisateur n'est pas touché.
 */
function source(): Source {
  if (process.env.MAQUETTE_E2E === '1') {
    const fake = () => (globalThis as { __maquetteFakeClipboard?: { text?: string; html?: string; png?: string } }).__maquetteFakeClipboard ?? {}
    return {
      content: async () => ({ text: fake().text ?? '', html: fake().html ?? '', image: Boolean(fake().png) }),
      png: async () => (fake().png ? Buffer.from(fake().png!, 'base64') : null),
    }
  }
  return {
    async content() {
      const items = await clipboard.read()
      const types = new Set(items.flatMap((i) => i.types))
      const html = types.has('text/html') ? await (await blobOf('text/html'))?.text() : ''
      // Capture Win+Maj+S, « Copier l'image » d'un navigateur : le bitmap arrive en image/png.
      return { text: await clipboard.readText().catch(() => ''), html: html ?? '', image: types.has(PNG) }
    },
    async png() {
      const blob = await blobOf(PNG)
      return blob ? Buffer.from(await blob.arrayBuffer()) : null
    },
  }
}

/** Nom d'élément tiré d'une URL : dernier segment sans extension, sinon « Image ». */
export function nameFromUrl(url: string): string {
  if (url.startsWith('data:')) return 'Image'
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    const base = last.replace(/\.[^.]+$/, '').trim()
    return base ? base.slice(0, 60) : 'Image'
  } catch {
    return 'Image'
  }
}

const net: Fetch = (url, init) => fetch(url, init)

/** Télécharge une image du web (http, https ou data:) dans le dossier des images du document. */
export async function fetchImage(url: string, f: Fetch = net): Promise<ImageImport> {
  const dir = getAssetDir()
  if (!dir) return { ok: false, message: 'image folder unavailable' }
  if (!/^(https?:|data:image\/)/i.test(url)) return { ok: false, message: 'unsupported image address' }
  try {
    const file = await download(f, url, MAX_WEB_BYTES, WEB_TIMEOUT_MS)
    const name = nameFromUrl(url)
    return { ok: true, name, ...(await importImage(dir, `image.${file.ext}`, file.bytes)) }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export function registerImagePasteIpc(): void {
  ipcMain.handle('clipboard:read', (): Promise<ClipboardContent> => source().content())
  ipcMain.handle('image:paste', async (): Promise<ImageImport> => {
    const dir = getAssetDir()
    try {
      const png = await source().png()
      if (!dir || !png) return { ok: false, message: 'no image in the clipboard' }
      return { ok: true, name: 'Pasted image', ...(await importImage(dir, 'image.png', png)) }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })
  ipcMain.handle('image:fetch', (_e, url: unknown) => (typeof url === 'string' ? fetchImage(url) : { ok: false, message: 'invalid address' }))
}
