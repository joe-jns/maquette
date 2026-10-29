import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { stat } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import type { ImageImport, OpenedFile } from '../shared/ipc'
import { writeFileAtomic } from './files'
import { isExportWindow } from './exportPng'
import { importImage } from './images'
import { carryAssets } from './pendingAssets'
import { aboutToWrite, documentShown, readDocForWindow, readForWindow } from './openFiles'
import { isOpenablePath, saveDefaultPath, withMaquetteExt } from './penOpen'
import { updateThumb } from './thumbs'
import { acceptPath, allowedSavePath, getAssetDir, getCurrentPath, getImportedFrom, offerPath, savedTo } from './state'

const FILTERS = [{ name: 'Maquette', extensions: ['maquette'] }]
/** « Ouvrir » : les maquettes et les fichiers Pen (convertis, jamais écrits). */
const OPEN_FILTERS = [
  { name: 'Maquette and Pen files', extensions: ['maquette', 'pen'] },
  { name: 'Maquette', extensions: ['maquette'] },
  { name: 'Pen', extensions: ['pen'] },
]

export function registerFileIpc(fileArg: string | undefined): void {
  if (fileArg && !fileArg.toLowerCase().endsWith('.pen')) offerPath(fileArg)

  ipcMain.handle('doc:initial', async (): Promise<OpenedFile | null> => {
    if (!fileArg) return null
    return readDocForWindow(fileArg)
  })

  ipcMain.handle('file:open', async (event): Promise<OpenedFile | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = win
      ? await dialog.showOpenDialog(win, { filters: OPEN_FILTERS, properties: ['openFile'] })
      : await dialog.showOpenDialog({ filters: OPEN_FILTERS, properties: ['openFile'] })
    const path = res.filePaths[0]
    if (res.canceled || !path) return null
    return readDocForWindow(path)
  })

  // Fichier lâché sur la fenêtre : un .maquette ou un .pen seulement.
  ipcMain.handle('file:open-path', async (event, path: unknown): Promise<OpenedFile | null> => {
    if (!fromEditor(event) || typeof path !== 'string' || !isAbsolute(path) || !isOpenablePath(path)) return null
    return readDocForWindow(path)
  })

  ipcMain.handle('image:import', async (_event, args: { name: string; bytes: Uint8Array }): Promise<ImageImport> => {
    // Document jamais enregistré : dossier d'attente, recopié au premier enregistrement.
    const dir = getAssetDir()
    if (!dir) return { ok: false, message: 'image folder unavailable' }
    try {
      return { ok: true, ...(await importImage(dir, args.name, args.bytes)) }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })

  ipcMain.handle('doc:loaded', (_event, path: string | null, importedFrom?: string | null): boolean => {
    const accepted = acceptPath(path, typeof importedFrom === 'string' ? importedFrom : null)
    if (accepted) documentShown(path, getImportedFrom())
    return accepted
  })

  // « Recharger » après un changement extérieur : le fichier courant, relu.
  ipcMain.handle('file:reload', async (_event, path: string): Promise<OpenedFile | null> => {
    const current = getCurrentPath()
    // Seulement le document affiché : un bandeau resté d'un document précédent ne recharge rien.
    if (!current || allowedSavePath(path) !== current) return null
    return readForWindow(current)
  })

  ipcMain.handle('file:save', async (event, args: { path: string | null; text: string; silent?: boolean }): Promise<string | null> => {
    // Sans boîte de dialogue, on n'écrit que dans le document courant.
    let target = allowedSavePath(args.path)
    // Enregistrement automatique : jamais de boîte de dialogue ouverte d'elle-même.
    if (!target && args.silent) return null
    if (!target) {
      const win = BrowserWindow.fromWebContents(event.sender)
      // .pen converti : un .maquette à côté de lui (le .pen n'est jamais écrit).
      const options = { filters: FILTERS, defaultPath: saveDefaultPath(getImportedFrom()) }
      const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (res.canceled || !res.filePath) return null
      target = withMaquetteExt(res.filePath)
    }
    return writeDocument(target, args.text)
  })

  // ——— Outil fichier de Claude (MCP) : chemins donnés par Claude, jamais de boîte de dialogue ———

  /** Ouvrir un .maquette existant : il est lu et proposé à la fenêtre, comme par « Ouvrir ». */
  ipcMain.handle('mcp:file-read', async (event, path: unknown): Promise<OpenedFile | { error: string }> => {
    if (!fromEditor(event)) return { error: 'refusé' }
    const target = mcpPath(path)
    if (typeof target !== 'string') return target
    try {
      if (!(await stat(target)).isFile()) return { error: `pas un fichier : ${target}` }
      return await readForWindow(target)
    } catch {
      return { error: `fichier introuvable : ${target}` }
    }
  })

  /** Enregistrer sous un chemin donné ; un autre fichier existant n'est écrasé qu'avec `replace`. */
  // `fresh` (outil fichier nouveau) : même le fichier ouvert n'est pas écrasé sans `replace`.
  ipcMain.handle('mcp:file-save-as', async (event, args: { path: unknown; text: string; replace?: boolean; fresh?: boolean }): Promise<{ path: string } | { error: string }> => {
    if (!fromEditor(event) || typeof args?.text !== 'string') return { error: 'refusé' }
    const target = mcpPath(args.path)
    if (typeof target !== 'string') return target
    const exists = await stat(target).then(() => true, () => false)
    if (exists && !args.replace && (args.fresh || allowedSavePath(target) !== target)) return { error: `${target} existe déjà : remplacer:true pour l'écraser` }
    if (!(await stat(dirname(target)).then((d) => d.isDirectory(), () => false))) return { error: `dossier introuvable : ${dirname(target)}` }
    return { path: await writeDocument(target, args.text) }
  })
}

/** Seule la fenêtre de l'éditeur (pas la fenêtre cachée de l'export) passe par ces canaux. */
const fromEditor = (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return !!win && !isExportWindow(win)
}

/** Chemin demandé par Claude : absolu et en .maquette, sinon une erreur lisible. */
function mcpPath(path: unknown): string | { error: string } {
  if (typeof path !== 'string' || !path.trim()) return { error: 'chemin manquant' }
  if (!isAbsolute(path)) return { error: `chemin absolu attendu : ${path}` }
  if (!path.toLowerCase().endsWith('.maquette')) return { error: 'le chemin doit finir par .maquette' }
  return resolve(path)
}

/** Écrit le document : images emportées si le dossier change, fichier atomique, document courant, aperçu. */
async function writeDocument(target: string, text: string): Promise<string> {
  // Nouveau dossier (premier enregistrement, « Enregistrer sous ») : les images suivent le document.
  const assets = getAssetDir()
  if (assets) await carryAssets(assets, dirname(target), text)
  aboutToWrite(text)
  await writeFileAtomic(target, text)
  savedTo(target)
  documentShown(target)
  // Aperçu de l'accueil : en arrière-plan, l'enregistrement n'attend pas (et n'échoue jamais pour lui).
  updateThumb(target, text)
  return target
}
