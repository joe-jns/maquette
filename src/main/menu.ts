import { BrowserWindow, Menu } from 'electron'
import type { MenuCommand } from '../shared/ipc'

const send = (cmd: MenuCommand) => () => BrowserWindow.getFocusedWindow()?.webContents.send('menu', cmd)

export function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Fichier',
        submenu: [
          { label: 'Nouveau', accelerator: 'CmdOrCtrl+N', click: send('new') },
          { label: 'Ouvrir…', accelerator: 'CmdOrCtrl+O', click: send('open') },
          { type: 'separator' },
          { label: 'Enregistrer', accelerator: 'CmdOrCtrl+S', click: send('save') },
          { label: 'Enregistrer sous…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
          { type: 'separator' },
          { label: 'Quitter', role: 'quit' },
        ],
      },
      {
        label: 'Édition',
        submenu: [
          { label: 'Annuler', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
          { label: 'Rétablir', accelerator: 'CmdOrCtrl+Y', click: send('redo') },
        ],
      },
      { label: 'Affichage', submenu: [{ role: 'toggleDevTools', label: 'Outils de développement' }] },
    ]),
  )
}
