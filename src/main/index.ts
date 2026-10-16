import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { handleAssets, registerAssetScheme } from './assets'
import { registerFileIpc } from './ipc'
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

registerFileIpc(fileArg)
registerAssetScheme()

app.whenReady().then(() => {
  handleAssets()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
