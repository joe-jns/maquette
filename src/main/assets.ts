import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolveAssetPath } from './assetPath'
import { getCurrentDir } from './state'

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'masset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
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
