import { app, ipcMain, type WebContents } from 'electron'
import { isAbsolute, join, normalize } from 'node:path'
import type { ChatSend, PermissionDecision } from '../../shared/chat'
import { ChatSession } from './chatSession'
import { ChatStore, UNTITLED } from './chatStore'

/** Une conversation par fenêtre de l'éditeur, créée à son premier appel. */
const sessions = new Map<WebContents, ChatSession>()

function sessionFor(sender: WebContents, store: ChatStore): ChatSession {
  let session = sessions.get(sender)
  if (session) return session
  session = new ChatSession({
    store,
    userData: app.getPath('userData'),
    relayPath: join(__dirname, 'relay.js'),
    emit: (event) => {
      if (!sender.isDestroyed()) sender.send('chat:event', event)
    },
  })
  sessions.set(sender, session)
  // Fenêtre rechargée, plantée ou fermée : claude est arrêté, ses demandes refusées.
  sender.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) session.kill()
  })
  sender.on('render-process-gone', () => session.kill())
  sender.once('destroyed', () => {
    session.kill()
    sessions.delete(sender)
  })
  return session
}

/** Chemin envoyé par la fenêtre : un fichier .maquette absolu, sinon sans titre. */
const cleanPath = (path: unknown): string | null =>
  typeof path === 'string' && isAbsolute(path) && path.toLowerCase().endsWith('.maquette') ? normalize(path) : null

export function registerChatIpc(): void {
  const store = new ChatStore(join(app.getPath('userData'), 'chats.json'))
  // Un document sans titre ne reprend pas la conversation d'un lancement précédent.
  void store.reset(UNTITLED)

  ipcMain.handle('chat:open', (event, path: unknown) => sessionFor(event.sender, store).open(cleanPath(path)))
  ipcMain.on('chat:send', (event, message: ChatSend) => {
    if (!message || typeof message.text !== 'string') return
    const images = Array.isArray(message.images) ? message.images.filter((i) => i && typeof i.data === 'string' && typeof i.mediaType === 'string') : []
    sessionFor(event.sender, store).send({ text: message.text, context: typeof message.context === 'string' ? message.context : '', images })
  })
  ipcMain.on('chat:stop', (event) => sessionFor(event.sender, store).stop())
  ipcMain.on('chat:permission', (event, requestId: string, decision: PermissionDecision) => {
    if (decision === 'allow' || decision === 'always' || decision === 'deny') sessionFor(event.sender, store).permission(String(requestId), decision)
  })
  ipcMain.handle('chat:reset', (event) => sessionFor(event.sender, store).reset())

  app.on('will-quit', () => {
    for (const session of sessions.values()) session.kill()
  })
}
