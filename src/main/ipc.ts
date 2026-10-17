import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { ImageImport, OpenedFile } from '../shared/ipc'
import { writeFileAtomic } from './files'
import { importImage } from './images'
import { aboutToWrite, documentShown, readForWindow } from './openFiles'
import { updateThumb } from './thumbs'
import { acceptPath, allowedSavePath, getCurrentDir, getCurrentPath, offerPath, savedTo } from './state'

const FILTERS = [{ name: 'Maquette', extensions: ['maquette'] }]

export function registerFileIpc(fileArg: string | undefined): void {
  if (fileArg) offerPath(fileArg)

  ipcMain.handle('doc:initial', async (): Promise<OpenedFile | null> => {
    if (!fileArg) return null
    return readForWindow(fileArg)
  })

  ipcMain.handle('file:open', async (event): Promise<OpenedFile | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = win
      ? await dialog.showOpenDialog(win, { filters: FILTERS, properties: ['openFile'] })
      : await dialog.showOpenDialog({ filters: FILTERS, properties: ['openFile'] })
    const path = res.filePaths[0]
    if (res.canceled || !path) return null
    return readForWindow(path)
  })

  ipcMain.handle('image:import', async (_event, args: { name: string; bytes: Uint8Array }): Promise<ImageImport> => {
    const dir = getCurrentDir()
    if (!dir) return { ok: false, message: 'Enregistrez d’abord le document : les images vont dans son dossier assets/' }
    try {
      return { ok: true, ...(await importImage(dir, args.name, args.bytes)) }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })

  ipcMain.handle('doc:loaded', (_event, path: string | null): boolean => {
    const accepted = acceptPath(path)
    if (accepted) documentShown(path)
    return accepted
  })

  // « Recharger » après un changement extérieur : le fichier courant, relu.
  ipcMain.handle('file:reload', async (_event, path: string): Promise<OpenedFile | null> => {
    const current = getCurrentPath()
    // Seulement le document affiché : un bandeau resté d'un document précédent ne recharge rien.
    if (!current || allowedSavePath(path) !== current) return null
    return readForWindow(current)
  })

  ipcMain.handle('file:save', async (event, args: { path: string | null; text: string }): Promise<string | null> => {
    // Sans boîte de dialogue, on n'écrit que dans le document courant.
    let target = allowedSavePath(args.path)
    if (!target) {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = { filters: FILTERS, defaultPath: 'Sans titre.maquette' }
      const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (res.canceled || !res.filePath) return null
      target = res.filePath.toLowerCase().endsWith('.maquette') ? res.filePath : `${res.filePath}.maquette`
    }
    aboutToWrite(args.text)
    await writeFileAtomic(target, args.text)
    savedTo(target)
    documentShown(target)
    // Aperçu de l'accueil : en arrière-plan, l'enregistrement n'attend pas (et n'échoue jamais pour lui).
    updateThumb(target, args.text)
    return target
  })
}
