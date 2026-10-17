import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { DocState, OpenedFile, RecoveryOffer } from '../shared/ipc'
import { BackupStore } from './backup'
import { offerPath } from './state'

/** Lancement en cours : les documents sans titre de cette session ont leur propre copie. */
const session = String(Date.now())
let store: BackupStore | null = null
const backups = () => (store ??= new BackupStore(join(app.getPath('userData'), 'backup')))

/** État « modifié » de chaque fenêtre, envoyé par elle à chaque changement. */
const states = new WeakMap<BrowserWindow, DocState>()
/** Fenêtres dont la fermeture a été confirmée (plus de question). */
const confirmed = new WeakSet<BrowserWindow>()

const mtime = async (path: string): Promise<number | null> => {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

export function registerSessionIpc(): void {
  ipcMain.handle('backup:write', (_e, args: { path: string | null; text: string }) => backups().write({ path: args.path, session }, args.text))
  ipcMain.handle('backup:clear', (_e, path: string | null) => backups().clear({ path, session }))
  ipcMain.handle('backup:pending', async (): Promise<RecoveryOffer[]> => {
    const list = await backups().pending(mtime)
    // Les sans-titre de ce lancement ne sont pas « à récupérer » : ce sont ceux qu'on est en train d'écrire.
    return list
      .filter((b) => b.path !== null || !b.id.endsWith(session))
      .map((b) => ({ id: b.id, name: b.path ? basename(b.path) : 'Sans titre', savedAt: b.savedAt }))
  })
  ipcMain.handle('backup:restore', async (_e, id: string): Promise<OpenedFile | null> => {
    const found = (await backups().pending(mtime)).find((b) => b.id === id)
    if (!found) return null
    // La copie restaurée repart avec la clé de ce lancement : l'ancienne n'a plus lieu d'être.
    await backups().discard(id)
    if (found.path) offerPath(found.path)
    return { path: found.path, text: found.text }
  })
  ipcMain.handle('backup:discard', (_e, id: string) => backups().discard(id))

  ipcMain.on('doc:state', (event, state: DocState) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) states.set(win, state)
  })
  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    confirmed.add(win)
    win.close()
  })
}

/** Question à la fermeture d'une fenêtre qui a des changements non enregistrés. */
export function guardClose(win: BrowserWindow): void {
  // Tests de bout en bout : pas de question (elle bloquerait leur fermeture), sauf ceux qui la testent.
  if (process.env.MAQUETTE_E2E === '1' && process.env.MAQUETTE_E2E_GUARD !== '1') return
  win.on('close', (event) => {
    const state = states.get(win)
    if (confirmed.has(win) || !state?.dirty) return
    event.preventDefault()
    void dialog
      .showMessageBox(win, {
        type: 'question',
        title: 'Maquette',
        message: `Enregistrer les modifications de ${state.name} ?`,
        detail: 'Sinon, elles seront perdues.',
        buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      })
      .then(async ({ response }) => {
        if (win.isDestroyed()) return
        if (response === 0) win.webContents.send('menu', 'save-and-close')
        else if (response === 1) {
          await backups().clear({ path: state.path, session })
          confirmed.add(win)
          win.close()
        }
      })
  })
}
