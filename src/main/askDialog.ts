import { ipcMain, type BrowserWindow, type WebContents } from 'electron'
import type { DialogRequest } from '../shared/ipc'

/** Questions envoyées aux fenêtres, en attente de leur réponse. */
const pending = new Map<number, { sender: WebContents; finish: (index: number) => void }>()
let nextId = 1
let listening = false

/**
 * Pose une question dans la fenêtre (dessinée par l'app, pas de boîte du système) ; renvoie l'indice
 * du bouton choisi. Fenêtre fermée, rechargée ou plantée avant la réponse : « annuler ».
 */
export function askWindow(win: BrowserWindow, request: DialogRequest): Promise<number> {
  if (win.isDestroyed()) return Promise.resolve(request.cancelIndex)
  if (!listening) {
    listening = true
    ipcMain.on('dialog:answer', (event, id: number, index: number) => {
      const entry = pending.get(id)
      // Seule la fenêtre interrogée répond à sa question.
      if (entry && entry.sender === event.sender) entry.finish(index)
    })
  }
  const sender = win.webContents
  const id = nextId++
  return new Promise((resolve) => {
    const cancel = () => finish(request.cancelIndex)
    const finish = (index: number) => {
      if (!pending.delete(id)) return
      sender.removeListener('destroyed', cancel)
      sender.removeListener('did-start-loading', cancel)
      sender.removeListener('render-process-gone', cancel)
      resolve(Number.isInteger(index) && index >= 0 && index < request.buttons.length ? index : request.cancelIndex)
    }
    pending.set(id, { sender, finish })
    sender.once('destroyed', cancel)
    sender.once('did-start-loading', cancel)
    sender.once('render-process-gone', cancel)
    sender.send('dialog:ask', id, request)
  })
}
