import { app, BrowserWindow, ipcMain } from 'electron'
import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { DocState, OpenedFile, RecoveryOffer } from '../shared/ipc'
import { askWindow } from './askDialog'
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
/** Fenêtres dont la question est affichée : une seule à la fois. */
const asking = new WeakSet<BrowserWindow>()

const mtime = async (path: string): Promise<number | null> => {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

/** Les opérations sur les copies passent une à une : une écriture en retard ne ressuscite pas une copie effacée. */
let chain: Promise<unknown> = Promise.resolve()
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work)
  chain = run.catch(() => undefined)
  return run
}

export function registerSessionIpc(): void {
  ipcMain.handle('backup:write', (_e, args: { path: string | null; text: string }) => serial(() => backups().write({ path: args.path, session }, args.text)))
  ipcMain.handle('backup:clear', (_e, path: string | null) => serial(() => backups().clear({ path, session })))
  ipcMain.handle('backup:pending', async (): Promise<RecoveryOffer[]> => {
    const list = await backups().pending(mtime)
    // Les sans-titre de ce lancement ne sont pas « à récupérer » : ce sont ceux qu'on est en train d'écrire.
    return list
      .filter((b) => b.path !== null || !b.id.endsWith(session))
      .map((b) => ({ id: b.id, name: b.path ? basename(b.path) : 'Sans titre', savedAt: b.savedAt }))
  })
  ipcMain.handle('backup:restore', async (_e, id: string): Promise<OpenedFile | null> => {
    // La copie n'est effacée qu'une fois le document rouvert et recopié (backup:discard par la fenêtre).
    const found = (await backups().pending(mtime)).find((b) => b.id === id)
    if (!found) return null
    if (found.path) offerPath(found.path)
    return { path: found.path, text: found.text }
  })
  ipcMain.handle('backup:discard', (_e, id: string) => serial(() => backups().discard(id)))

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
    if (asking.has(win)) return
    asking.add(win)
    // Posée dans la fenêtre qui ferme ; fermée ou rechargée entre-temps : « Annuler ».
    void askWindow(win, {
      message: `Enregistrer les modifications de ${state.name} ?`,
      detail: 'Sinon, elles seront perdues.',
      buttons: [{ label: 'Enregistrer', kind: 'primary' }, { label: 'Ne pas enregistrer', kind: 'danger' }, { label: 'Annuler' }],
      defaultIndex: 0,
      cancelIndex: 2,
    }).then(async (response) => {
      asking.delete(win)
      if (win.isDestroyed()) return
      if (response === 0) win.webContents.send('menu', 'save-and-close')
      else if (response === 1) {
        const now = states.get(win) ?? state
        await serial(() => backups().clear({ path: now.path, session }))
        confirmed.add(win)
        win.close()
      }
    })
  })
}
