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
          // Raccourcis affichés mais gérés par le canevas (sinon l'annulation se ferait deux fois).
          { label: 'Annuler', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: send('undo') },
          { label: 'Rétablir', accelerator: 'CmdOrCtrl+Y', registerAccelerator: false, click: send('redo') },
        ],
      },
      { label: 'Affichage', submenu: [{ role: 'toggleDevTools', label: 'Outils de développement' }] },
    ]),
  )
}
