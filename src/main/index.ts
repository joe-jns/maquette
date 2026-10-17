import { app, BrowserWindow, protocol } from 'electron'
import { join } from 'node:path'
import { ASSET_SCHEME, handleAssets } from './assets'
import { CHAT_IMAGE_SCHEME_DEF, chatImagesDir, handleChatImages } from './chat/chatImageService'
import { registerChatIpc } from './chat/chatIpc'
import { closeExportWindow, isExportWindow, registerExportIpc, renderNode } from './exportPng'
import { FONT_SCHEME, handleFonts, registerFontIpc } from './fontService'
import { registerFileIpc } from './ipc'
import { registerHomeIpc } from './home'
import { registerImageIpc } from './imageSearch'
import { registerImagePasteIpc } from './imagePaste'
import { guardClose, registerSessionIpc } from './docSession'
import { startMcp } from './mcpApp'
import { registerTasteIpc } from './taste'
import { buildMenu, setRecentFiles } from './menu'
import { initOpenFiles, openInWindow } from './openFiles'

// Dossier de données imposé (tests, relais MCP de test) : jeton, copies de secours, fichiers récents.
if (process.env.MAQUETTE_USER_DATA) app.setPath('userData', process.env.MAQUETTE_USER_DATA)

const maquetteArg = (argv: string[]) => argv.slice(1).find((a) => a.toLowerCase().endsWith('.maquette'))
const fileArg = maquetteArg(process.argv)

// Une seule Maquette ouverte : double-cliquer un .maquette l'ouvre dans la fenêtre existante.
const firstInstance = app.requestSingleInstanceLock()
if (!firstInstance) app.quit()
app.on('second-instance', (_event, argv) => {
  const path = maquetteArg(argv)
  const win = editorWindows()[0]
  if (path) void openInWindow(path)
  else if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

/** Tests : fenêtre hors de l'écran, sans bouton dans la barre des tâches ni focus, pour laisser le PC utilisable. */
const background = process.env.MAQUETTE_E2E === '1' || process.env.MAQUETTE_BACKGROUND === '1'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Maquette',
    show: false,
    ...(background ? { x: -20000, y: -20000, skipTaskbar: true } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Tests en arrière-plan : la fenêtre cachée derrière d'autres doit continuer à dessiner.
      backgroundThrottling: process.env.MAQUETTE_E2E !== '1',
    },
  })
  win.once('ready-to-show', () => (background ? win.showInactive() : win.show()))
  guardClose(win)
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
registerHomeIpc()
registerFontIpc()
registerExportIpc()
registerTasteIpc()
registerImageIpc()
registerImagePasteIpc()
registerChatIpc()
registerSessionIpc()
// Tests : la fenêtre reste derrière les autres ; Chromium ne doit pas la ralentir pour autant.
if (process.env.MAQUETTE_E2E === '1') {
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}
if (process.env.MAQUETTE_E2E === '1') {
  ;(globalThis as unknown as { __maquetteRenderNode: typeof renderNode }).__maquetteRenderNode = renderNode
}
// Un seul appel : chaque appel remplace la liste des protocoles privilégiés.
protocol.registerSchemesAsPrivileged([ASSET_SCHEME, FONT_SCHEME, CHAT_IMAGE_SCHEME_DEF])

app.whenReady().then(() => {
  // Lancement refusé (une Maquette tourne déjà et a reçu le fichier) : rien d'autre à faire.
  if (!firstInstance) return
  handleAssets()
  handleFonts()
  handleChatImages(chatImagesDir())
  buildMenu()
  createWindow()
  initOpenFiles({ editorWindow: () => editorWindows()[0], onRecentChange: setRecentFiles })
  void startMcp(() => editorWindows()[0])
  app.on('activate', () => {
    if (editorWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => closeExportWindow())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
