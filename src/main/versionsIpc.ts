import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { isVersionId, type VersionInfo } from '../shared/versions'
import { isExportWindow } from './exportPng'
import { getCurrentPath } from './state'
import { renderPreview } from './thumbs'
import { VersionStore } from './versions'

/**
 * Historique de versions du fichier ouvert (`<userData>/versions/`). La fenêtre ne donne jamais de
 * chemin : tout porte sur le document courant ; un document jamais enregistré n'a pas de versions.
 */
let store: VersionStore | null = null
const versions = () => (store ??= new VersionStore(join(app.getPath('userData'), 'versions')))

/** Seule la fenêtre de l'éditeur (pas la fenêtre cachée de l'export) passe par ces canaux. */
const fromEditor = (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return !!win && !isExportWindow(win)
}

/** « Enregistrer sous » vers un autre chemin : les versions suivent le document. Ne lève jamais. */
export async function carryVersions(from: string, to: string): Promise<void> {
  await versions().copy(from, to).catch(() => undefined)
}

export function registerVersionIpc(): void {
  ipcMain.handle('versions:list', async (event): Promise<VersionInfo[] | null> => {
    const path = getCurrentPath()
    if (!fromEditor(event) || !path) return null
    return versions().list(path)
  })

  ipcMain.handle('versions:save', async (event, text: unknown, name: unknown, auto: unknown): Promise<VersionInfo | null> => {
    const path = getCurrentPath()
    if (!fromEditor(event) || !path || typeof text !== 'string' || typeof name !== 'string') return null
    return versions().add(path, text, { name, auto: auto === true })
  })

  ipcMain.handle('versions:read', async (event, id: unknown): Promise<string | null> => {
    const path = getCurrentPath()
    if (!fromEditor(event) || !path || !isVersionId(id)) return null
    return versions().read(path, id)
  })

  ipcMain.handle('versions:rename', async (event, id: unknown, name: unknown): Promise<boolean> => {
    const path = getCurrentPath()
    if (!fromEditor(event) || !path || !isVersionId(id) || typeof name !== 'string') return false
    return versions().rename(path, id, name)
  })

  ipcMain.handle('versions:remove', async (event, id: unknown): Promise<boolean> => {
    const path = getCurrentPath()
    if (!fromEditor(event) || !path || !isVersionId(id)) return false
    return versions().remove(path, id)
  })

  ipcMain.handle('versions:preview', async (event, id: unknown): Promise<string | null> => {
    const path = getCurrentPath()
    if (!fromEditor(event) || !path || !isVersionId(id)) return null
    const text = await versions().read(path, id)
    if (text === null) return null
    const image = await renderPreview(text).catch(() => null)
    return image && image !== 'empty' ? `data:image/jpeg;base64,${image.toString('base64')}` : null
  })
}
