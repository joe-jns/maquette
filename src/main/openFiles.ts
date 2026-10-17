import { app, BrowserWindow, dialog } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { OpenedFile } from '../shared/ipc'
import { RecentStore } from './recent'
import { offerPath } from './state'
import { FileWatcher } from './watch'

let recent: RecentStore | null = null
let watcher: FileWatcher | null = null
let editorWindow: () => BrowserWindow | undefined = () => undefined
let onRecentChange: (list: string[]) => void = () => undefined

const recents = () => (recent ??= new RecentStore(join(app.getPath('userData'), 'recent.json')))

/** Branche les fichiers récents (menu) et la surveillance du fichier ouvert. */
export function initOpenFiles(opts: { editorWindow: () => BrowserWindow | undefined; onRecentChange: (list: string[]) => void }): void {
  editorWindow = opts.editorWindow
  onRecentChange = opts.onRecentChange
  watcher = new FileWatcher((path) => editorWindow()?.webContents.send('file:changed', path))
  void recents().list().then(onRecentChange)
}

/** Lit un fichier pour la fenêtre : il lui est proposé, et son contenu devient la référence de la surveillance. */
export async function readForWindow(path: string): Promise<OpenedFile> {
  const text = await readFile(path, 'utf8')
  offerPath(path)
  watcher?.wrote(text)
  return { path, text }
}

/** La fenêtre a chargé ce fichier (ou un nouveau document) : surveillance et fichiers récents. */
export function documentShown(path: string | null): void {
  watcher?.watch(path)
  if (path) void addRecent(path)
}

/** Avant un enregistrement : notre propre écriture ne doit pas passer pour un changement extérieur. */
export function aboutToWrite(text: string): void {
  watcher?.wrote(text)
}

async function addRecent(path: string): Promise<void> {
  onRecentChange(await recents().add(path))
  app.addRecentDocument(path)
}

/** Ouvre un fichier demandé hors de la fenêtre (récents, double-clic avec l'app déjà lancée). */
export async function openInWindow(path: string): Promise<void> {
  const win = editorWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
  try {
    win.webContents.send('open-file', await readForWindow(path))
  } catch {
    await dialog.showMessageBox(win, { type: 'warning', message: `${basename(path)} est introuvable.`, detail: `${path}\nIl est retiré des fichiers récents.` })
    onRecentChange(await recents().remove(path))
  }
}
