import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import type { OpenedFile } from '../shared/ipc'
import { writeFileAtomic } from './files'
import { acceptPath, allowedSavePath, offerPath, savedTo } from './state'

const FILTERS = [{ name: 'Maquette', extensions: ['maquette'] }]

export function registerFileIpc(fileArg: string | undefined): void {
  if (fileArg) offerPath(fileArg)

  ipcMain.handle('doc:initial', async (): Promise<OpenedFile | null> => {
    if (!fileArg) return null
    return { path: fileArg, text: await readFile(fileArg, 'utf8') }
  })

  ipcMain.handle('file:open', async (event): Promise<OpenedFile | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = win
      ? await dialog.showOpenDialog(win, { filters: FILTERS, properties: ['openFile'] })
      : await dialog.showOpenDialog({ filters: FILTERS, properties: ['openFile'] })
    const path = res.filePaths[0]
    if (res.canceled || !path) return null
    offerPath(path)
    return { path, text: await readFile(path, 'utf8') }
  })

  ipcMain.handle('doc:loaded', (_event, path: string | null): boolean => acceptPath(path))

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
    await writeFileAtomic(target, args.text)
    savedTo(target)
    return target
  })
}
