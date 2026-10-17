import { net, protocol, type CustomScheme } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolveAssetPath } from './assetPath'
import { getCurrentDir } from './state'

/** Déclaré avec les autres protocoles, en un seul appel à registerSchemesAsPrivileged (index.ts). */
export const ASSET_SCHEME: CustomScheme = {
  scheme: 'masset',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}

/** masset://doc/<chemin relatif au document> → fichier local. */
export function handleAssets(): void {
  protocol.handle('masset', (request) => {
    const base = getCurrentDir()
    const path = base ? resolveAssetPath(base, new URL(request.url).pathname) : null
    if (!path) return new Response('introuvable', { status: 404 })
    return net.fetch(pathToFileURL(path).toString())
  })
}
