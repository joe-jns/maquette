import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { OpenedFile } from '../shared/ipc'

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
  const e2e = process.env.MAQUETTE_E2E === '1'
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL + (e2e ? '?e2e=1' : ''))
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), e2e ? { query: { e2e: '1' } } : undefined)
  }
  return win
}

ipcMain.handle('doc:initial', async (): Promise<OpenedFile | null> => {
  if (!fileArg) return null
  return { path: fileArg, text: await readFile(fileArg, 'utf8') }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
