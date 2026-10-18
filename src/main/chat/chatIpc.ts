import { app, ipcMain, type WebContents } from 'electron'
import { existsSync } from 'node:fs'
import { isAbsolute, join, normalize } from 'node:path'
import type { ChatSend, ConversationList, PermissionDecision } from '../../shared/chat'
import { ChatImages } from './chatImages'
import { chatImagesDir, nativeThumb } from './chatImageService'
import { ChatSession } from './chatSession'
import { chatKey, ChatStore, UNTITLED } from './chatStore'

/** Une conversation par fenêtre de l'éditeur, créée à son premier appel. */
const sessions = new Map<WebContents, ChatSession>()

function sessionFor(sender: WebContents, store: ChatStore, images: ChatImages): ChatSession {
  let session = sessions.get(sender)
  if (session) return session
  session = new ChatSession({
    store,
    images,
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
  const images = new ChatImages(chatImagesDir(), nativeThumb)
  // Un document sans titre ne reprend pas la conversation d'un lancement précédent ; ses vignettes,
  // comme toutes celles qu'aucune conversation n'utilise plus, sont supprimées.
  void store
    .forget(UNTITLED)
    .then(() => store.images())
    .then((keep) => images.prune(keep))
    .catch(() => undefined)
  const session = (sender: WebContents) => sessionFor(sender, store, images)

  ipcMain.handle('chat:open', (event, path: unknown) => session(event.sender).open(cleanPath(path)))
  ipcMain.on('chat:send', (event, message: ChatSend) => {
    if (!message || typeof message.text !== 'string') return
    const images = Array.isArray(message.images) ? message.images.filter((i) => i && typeof i.data === 'string' && typeof i.mediaType === 'string') : []
    session(event.sender).send({ text: message.text, context: typeof message.context === 'string' ? message.context : '', images })
  })
  ipcMain.on('chat:stop', (event) => session(event.sender).stop())
  ipcMain.on('chat:permission', (event, requestId: string, decision: PermissionDecision) => {
    if (decision === 'allow' || decision === 'always' || decision === 'deny') session(event.sender).permission(String(requestId), decision)
  })
  ipcMain.handle('chat:reset', (event) => session(event.sender).reset())
  ipcMain.handle('chat:conversations', async (event): Promise<ConversationList> => {
    const { key } = session(event.sender).current
    const [own, others] = await Promise.all([store.list(key), store.others(key)])
    return { ...own, others: others.map((o) => ({ ...o, missing: !existsSync(o.path) })) }
  })
  const id = (value: unknown) => (typeof value === 'string' && value ? value : null)
  ipcMain.handle('chat:switch', (event, conv: unknown) => {
    const c = id(conv)
    return c ? session(event.sender).switchTo(c) : null
  })
  ipcMain.handle('chat:rename', async (event, conv: unknown, title: unknown) => {
    const c = id(conv)
    if (c && typeof title === 'string') await session(event.sender).rename(c, title)
  })
  ipcMain.handle('chat:remove', (event, conv: unknown) => {
    const c = id(conv)
    return c ? session(event.sender).remove(c) : null
  })
  ipcMain.handle('chat:prepare', async (_event, path: unknown, conv: unknown) => {
    const p = cleanPath(path)
    const c = id(conv)
    if (p && c) await store.select(chatKey(p), c)
  })
  ipcMain.handle('chat:options', (event) => session(event.sender).options())
  ipcMain.handle('chat:set-options', (event, patch: unknown) => {
    const p = patch && typeof patch === 'object' ? (patch as Record<string, unknown>) : {}
    return session(event.sender).setOptions(typeof p.taste === 'boolean' ? { taste: p.taste } : {})
  })

  app.on('will-quit', () => {
    for (const session of sessions.values()) session.kill()
  })
}
