import { app, ipcMain, protocol, type CustomScheme } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FontInfo } from '../shared/ipc'
import { resolveFontFile } from './fontPath'
import { FontCache, fetchBytes, fetchText, type FetchBytes, type FetchText } from './fonts'

/** mfont://<empreinte>.woff2 : chargé par les @font-face injectées, donc en requête CORS. */
export const FONT_SCHEME: CustomScheme = {
  scheme: 'mfont',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}

let dir: string | null = null
let cache: FontCache | null = null

/** Dossier du cache : MAQUETTE_FONTS_DIR (tests) ou <userData>/fonts. */
function fontsDir(): string {
  dir ??= process.env.MAQUETTE_FONTS_DIR || join(app.getPath('userData'), 'fonts')
  return dir
}

/** Le cache unique de l'application. */
function fontCache(): FontCache {
  if (!cache) {
    // MAQUETTE_FONTS_OFFLINE=1 : tout téléchargement échoue, pour des tests indépendants du réseau.
    const offline = process.env.MAQUETTE_FONTS_OFFLINE === '1'
    const noNetwork = async (): Promise<never> => {
      throw new Error('Polices hors connexion')
    }
    const text: FetchText = offline ? noNetwork : fetchText
    const bytes: FetchBytes = offline ? noNetwork : fetchBytes
    cache = new FontCache(fontsDir(), text, bytes)
  }
  return cache
}

export function registerFontIpc(): void {
  ipcMain.handle('fonts:catalog', (): Promise<FontInfo[]> => fontCache().catalog())
  ipcMain.handle('fonts:css', async (_event, family: unknown): Promise<string | null> =>
    typeof family === 'string' && family ? fontCache().css(family) : null,
  )
}

/** mfont://<16 hexadécimaux>.woff2 → fichier du cache ; tout autre nom → 404. */
export function handleFonts(): void {
  protocol.handle('mfont', async (request) => {
    const path = resolveFontFile(fontsDir(), new URL(request.url).hostname)
    if (!path) return new Response('introuvable', { status: 404 })
    try {
      const bytes = await readFile(path)
      return new Response(new Uint8Array(bytes), {
        headers: { 'Content-Type': 'font/woff2', 'Access-Control-Allow-Origin': '*' },
      })
    } catch {
      return new Response('introuvable', { status: 404 })
    }
  })
}
