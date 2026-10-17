import { net, protocol, type CustomScheme } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolveAssetPath } from './assetPath'
import { getAssetDir } from './state'

/** Déclaré avec les autres protocoles, en un seul appel à registerSchemesAsPrivileged (index.ts). */
export const ASSET_SCHEME: CustomScheme = {
  scheme: 'masset',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}

/** masset://doc/<chemin relatif au document> → fichier local (dossier d'attente pour un sans-titre). */
export function handleAssets(): void {
  protocol.handle('masset', (request) => {
    const base = getAssetDir()
    const path = base ? resolveAssetPath(base, new URL(request.url).pathname) : null
    if (!path) return new Response('introuvable', { status: 404 })
    return net.fetch(pathToFileURL(path).toString())
  })
}
