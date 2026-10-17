import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, sep } from 'node:path'
import type { OpenedFile } from '../shared/ipc'
import { shortFolder, type RecentEntry } from '../shared/home'
import { isExportWindow } from './exportPng'
import { listRecents, readForWindow, removeRecent } from './openFiles'
import { thumbDataUrl, thumbInfo } from './thumbs'

const sameKey = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)

/** Seule la fenêtre de l'éditeur parle à l'accueil (pas la fenêtre cachée de l'export). */
const fromEditor = (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return !!win && !isExportWindow(win)
}

/** Le chemin demandé est bien dans les récents : l'accueil ne lit ni ne montre rien d'autre. */
async function knownRecent(path: unknown): Promise<string | null> {
  if (typeof path !== 'string') return null
  return (await listRecents()).find((p) => sameKey(p) === sameKey(path)) ?? null
}

async function entry(path: string): Promise<RecentEntry> {
  const modified = await stat(path).then(
    (s) => (s.isFile() ? Math.round(s.mtimeMs) : null),
    () => null,
  )
  return {
    path,
    name: basename(path).replace(/\.maquette$/i, ''),
    folder: shortFolder(dirname(path), homedir(), sep === '\\' ? '\\' : '/'),
    modified,
    missing: modified === null,
    thumb: modified === null ? null : await thumbInfo(path),
  }
}

export function registerHomeIpc(): void {
  ipcMain.handle('home:list', async (event): Promise<RecentEntry[]> => {
    if (!fromEditor(event)) return []
    return Promise.all((await listRecents()).map(entry))
  })

  ipcMain.handle('home:thumb', (event, hash: unknown) => (fromEditor(event) ? thumbDataUrl(hash) : null))

  ipcMain.handle('home:open', async (event, path: unknown): Promise<OpenedFile | null> => {
    const known = fromEditor(event) ? await knownRecent(path) : null
    if (!known) return null
    try {
      return await readForWindow(known)
    } catch {
      return null
    }
  })

  ipcMain.handle('home:remove', async (event, path: unknown): Promise<void> => {
    const known = fromEditor(event) ? await knownRecent(path) : null
    if (known) await removeRecent(known)
  })

  ipcMain.handle('home:reveal', async (event, path: unknown): Promise<void> => {
    const known = fromEditor(event) ? await knownRecent(path) : null
    if (known) shell.showItemInFolder(known)
  })
}
