import { BrowserWindow, Menu } from 'electron'
import type { MenuCommand } from '../shared/ipc'
import { connectClaudeCode } from './claudeConnect'
import { openInWindow } from './openFiles'

/** La fenêtre de l'éditeur visée : celle qui a le focus, sinon l'éditeur affiché (pas la fenêtre cachée du rendu). */
const target = (): BrowserWindow | undefined =>
  BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find((w) => w.isVisible() && !w.webContents.isOffscreen())
const send = (cmd: MenuCommand) => () => target()?.webContents.send('menu', cmd)

let recentList: string[] = []

/** Le sous-menu des fichiers récents suit la liste (reconstruit à chaque changement). */
export function setRecentFiles(list: string[]): void {
  recentList = list
  buildMenu()
}

const mac = process.platform === 'darwin'

export function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      // macOS : le premier menu porte le nom de l'app (À propos, Masquer, Quitter).
      ...(mac ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'File',
        submenu: [
          { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: send('home') },
          { type: 'separator' },
          { label: 'New', accelerator: 'CmdOrCtrl+N', click: send('new') },
          { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
          {
            label: 'Open recent',
            enabled: recentList.length > 0,
            submenu: recentList.length
              ? recentList.map((path) => ({ label: path.replace(/&/g, '&&'), click: () => void openInWindow(path) }))
              : [{ label: 'None', enabled: false }],
          },
          { type: 'separator' },
          { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
          { label: 'Save as…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
          { type: 'separator' },
          {
            label: 'Export selection as PNG',
            submenu: [
              { label: '1×', click: send('export-png-1') },
              { label: '2×', accelerator: 'CmdOrCtrl+Shift+E', click: send('export-png-2') },
              { label: '3×', click: send('export-png-3') },
            ],
          },
          { type: 'separator' },
          { label: 'Connect to Claude Code…', click: () => void connectClaudeCode(BrowserWindow.getFocusedWindow() ?? undefined) },
          // macOS : Quitter est dans le menu de l'app.
          ...(mac ? [] : [{ type: 'separator' as const }, { label: 'Quit', role: 'quit' as const }]),
        ],
      },
      {
        label: 'Edit',
        submenu: [
          // Raccourcis affichés mais gérés par le canevas (sinon l'annulation se ferait deux fois).
          { label: 'Undo', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: send('undo') },
          { label: 'Redo', accelerator: 'CmdOrCtrl+Y', registerAccelerator: false, click: send('redo') },
          // macOS : sans ces rôles, Cmd+C, Cmd+V et Cmd+A ne marchent pas dans les champs de texte. Sur le canevas,
          // la page traite la touche d'abord (preventDefault) : le menu ne la reçoit pas.
          ...(mac
            ? [
                { type: 'separator' as const },
                { role: 'cut' as const },
                { role: 'copy' as const },
                { role: 'paste' as const },
                { role: 'selectAll' as const },
              ]
            : []),
        ],
      },
      {
        label: 'View',
        submenu: [
          // Ctrl+L est géré par la fenêtre (il marche aussi depuis la saisie du chat).
          { label: 'Chat with Claude', accelerator: 'CmdOrCtrl+L', registerAccelerator: false, click: send('toggle-chat') },
          { type: 'separator' },
          { role: 'toggleDevTools', label: 'Developer tools' },
        ],
      },
    ]),
  )
}
