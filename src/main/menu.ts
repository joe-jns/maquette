import { BrowserWindow, Menu } from 'electron'
import type { MenuCommand } from '../shared/ipc'
import { connectClaudeCode } from './claudeConnect'

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
          {
            label: 'Exporter la sélection en PNG',
            submenu: [
              { label: '1×', click: send('export-png-1') },
              { label: '2×', accelerator: 'CmdOrCtrl+Shift+E', click: send('export-png-2') },
              { label: '3×', click: send('export-png-3') },
            ],
          },
          { type: 'separator' },
          { label: 'Connecter à Claude Code…', click: () => void connectClaudeCode(BrowserWindow.getFocusedWindow() ?? undefined) },
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
