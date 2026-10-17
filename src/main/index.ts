import { app, BrowserWindow, protocol } from 'electron'
import { join } from 'node:path'
import { ASSET_SCHEME, handleAssets } from './assets'
import { closeExportWindow, isExportWindow, registerExportIpc, renderNode } from './exportPng'
import { FONT_SCHEME, handleFonts, registerFontIpc } from './fontService'
import { registerFileIpc } from './ipc'
import { startMcp } from './mcpApp'
import { buildMenu } from './menu'

const fileArg = process.argv.slice(1).find((a) => a.toLowerCase().endsWith('.maquette'))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Maquette',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  // La fenêtre cachée de l'export ne doit pas garder l'app ouverte une fois l'éditeur fermé.
  win.on('closed', () => {
    if (editorWindows().length === 0) closeExportWindow()
  })
  // La fenêtre ne quitte jamais l'éditeur : ni navigation (fichier lâché, lien), ni nouvelle fenêtre.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const e2e = process.env.MAQUETTE_E2E === '1'
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL + (e2e ? '?e2e=1' : ''))
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), e2e ? { query: { e2e: '1' } } : undefined)
  }
  return win
}

const editorWindows = () => BrowserWindow.getAllWindows().filter((w) => !isExportWindow(w))

registerFileIpc(fileArg)
registerFontIpc()
registerExportIpc()
if (process.env.MAQUETTE_E2E === '1') {
  ;(globalThis as unknown as { __maquetteRenderNode: typeof renderNode }).__maquetteRenderNode = renderNode
}
// Un seul appel : chaque appel remplace la liste des protocoles privilégiés.
protocol.registerSchemesAsPrivileged([ASSET_SCHEME, FONT_SCHEME])

app.whenReady().then(() => {
  handleAssets()
  handleFonts()
  buildMenu()
  createWindow()
  void startMcp(() => editorWindows()[0])
  app.on('activate', () => {
    if (editorWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => closeExportWindow())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
