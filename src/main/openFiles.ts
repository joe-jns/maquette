import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { OpenedFile } from '../shared/ipc'
import { askWindow } from './askDialog'
import { RecentStore } from './recent'
import { offerPath } from './state'
import { ensureThumb, removeThumb } from './thumbs'
import { FileWatcher } from './watch'

let recent: RecentStore | null = null
let watcher: FileWatcher | null = null
let editorWindow: () => BrowserWindow | undefined = () => undefined
let onRecentChange: (list: string[]) => void = () => undefined
/** Textes lus pour la fenêtre, pas encore acceptés : ils ne deviennent la référence qu'une fois affichés. */
const read = new Map<string, string>()
const key = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path)
/** Fenêtre prête à recevoir un fichier ; sinon le fichier attend (double-clic pendant le démarrage). */
let ready = false
let waiting: string | null = null

const recents = () => (recent ??= new RecentStore(join(app.getPath('userData'), 'recent.json')))

/** Branche les fichiers récents (menu) et la surveillance du fichier ouvert. */
export function initOpenFiles(opts: { editorWindow: () => BrowserWindow | undefined; onRecentChange: (list: string[]) => void }): void {
  editorWindow = opts.editorWindow
  onRecentChange = opts.onRecentChange
  watcher = new FileWatcher((path) => editorWindow()?.webContents.send('file:changed', path))
  void recents().list().then(onRecentChange)
  ipcMain.on('mcp:ready', (_e, isReady: boolean) => {
    ready = isReady
    if (ready && waiting) {
      const path = waiting
      waiting = null
      void openInWindow(path)
    }
  })
}

/** La fenêtre de l'éditeur (pas celle, cachée, de l'export), s'il y en a une. */
export const currentEditorWindow = (): BrowserWindow | undefined => editorWindow()

/** Lit un fichier pour la fenêtre : il lui est proposé, et son contenu devient la référence de la surveillance. */
export async function readForWindow(path: string): Promise<OpenedFile> {
  const text = await readFile(path, 'utf8')
  offerPath(path)
  read.set(key(path), text)
  return { path, text }
}

/** La fenêtre a chargé ce fichier (ou un nouveau document) : surveillance et fichiers récents. */
export function documentShown(path: string | null): void {
  const text = path ? read.get(key(path)) : undefined
  if (path) read.delete(key(path))
  if (text !== undefined) watcher?.wrote(text)
  watcher?.watch(path)
  if (path) void addRecent(path)
  // Ouvert depuis le disque sans aperçu pour l'accueil : il est fait un peu plus tard.
  if (path && text !== undefined) ensureThumb(path, text)
}

/** Les fichiers récents, du plus récemment ouvert au plus ancien. */
export const listRecents = (): Promise<string[]> => recents().list()

/** Retire un fichier des récents (menu et accueil suivent) ; son aperçu est effacé. */
export async function removeRecent(path: string): Promise<void> {
  onRecentChange(await recents().remove(path))
  await removeThumb(path)
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
  if (!win || !ready) {
    waiting = path
    return
  }
  if (win.isMinimized()) win.restore()
  win.focus()
  try {
    win.webContents.send('open-file', await readForWindow(path))
  } catch {
    // Retiré des récents sans attendre la réponse : la question n'a qu'un bouton.
    await removeRecent(path)
    await askWindow(win, {
      message: `${basename(path)} could not be found.`,
      detail: `${path}\nIt has been removed from recent files.`,
      buttons: [{ label: 'OK', kind: 'primary' }],
      cancelIndex: 0,
      defaultIndex: 0,
    })
  }
}
