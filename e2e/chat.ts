import type { ElectronApplication, Page } from '@playwright/test'
import type { ChatEvent, ChatItem } from '../src/shared/chat'

/** Outils partagés des tests du panneau de chat : un faux moteur dans le principal. */

type Call = [string, ...unknown[]]

/**
 * Remplace les canaux `chat:*` du principal (le vrai moteur, s'il est là, ne lance rien) :
 * `chat:open` renvoie `history`, les autres notent leurs appels dans `globalThis.__chatCalls`.
 */
export async function fakeChat(app: ElectronApplication, history: ChatItem[]): Promise<void> {
  await app.evaluate(({ ipcMain }, items) => {
    const g = globalThis as unknown as { __chatCalls: unknown[][] }
    g.__chatCalls = []
    ipcMain.removeHandler('chat:open')
    ipcMain.handle('chat:open', (_e, path: unknown) => {
      g.__chatCalls.push(['chat:open', path])
      return items
    })
    ipcMain.removeHandler('chat:reset')
    ipcMain.handle('chat:reset', () => {
      g.__chatCalls.push(['chat:reset'])
    })
    for (const channel of ['chat:send', 'chat:stop', 'chat:permission']) {
      ipcMain.removeAllListeners(channel)
      ipcMain.on(channel, (_e, ...args: unknown[]) => g.__chatCalls.push([channel, ...args]))
    }
  }, history)
}

/** Recharge la conversation : un nouveau chemin de fichier déclenche `chat:open`. */
export async function reopen(page: Page, path = 'C:/essais/chat.maquette'): Promise<void> {
  await page.evaluate((p) => {
    const store = (window as unknown as { __maquetteStore: { getState(): { doc: unknown; load(doc: unknown, path: string): void } } }).__maquetteStore
    store.getState().load(store.getState().doc, p)
  }, path)
}

/** Événement du moteur vers la fenêtre de l'éditeur. */
export async function emit(app: ElectronApplication, event: ChatEvent): Promise<void> {
  await app.evaluate(({ BrowserWindow }, ev) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed() && !w.webContents.getURL().includes('export')) w.webContents.send('chat:event', ev)
    }
  }, event)
}

export const calls = (app: ElectronApplication): Promise<Call[]> =>
  app.evaluate(() => (globalThis as unknown as { __chatCalls: Call[] }).__chatCalls)
