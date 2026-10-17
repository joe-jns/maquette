import type { ElectronApplication, Page } from '@playwright/test'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
    let options: Record<string, unknown> = { taste: false }
    ipcMain.removeHandler('chat:options')
    ipcMain.handle('chat:options', () => options)
    ipcMain.removeHandler('chat:set-options')
    ipcMain.handle('chat:set-options', (_e, patch: Record<string, unknown>) => {
      g.__chatCalls.push(['chat:set-options', patch])
      options = { ...options, ...patch }
      return options
    })
    for (const channel of ['chat:send', 'chat:stop', 'chat:permission']) {
      ipcMain.removeAllListeners(channel)
      ipcMain.on(channel, (_e, ...args: unknown[]) => g.__chatCalls.push([channel, ...args]))
    }
  }, history)
}

/** Faux `claude` (e2e/fixtures/fake-claude.mjs) : jamais le vrai. */
export const FAKE_CLAUDE = JSON.stringify(['node', resolve('e2e/fixtures/fake-claude.mjs')])

export interface EngineSetup { dir: string; file: string; userData: string; log: string; env: Record<string, string> }

/** Document de test dans un dossier à lui, données et journal du faux claude à part. */
export function engineSetup(extra: Record<string, string> = {}): EngineSetup {
  const dir = mkdtempSync(join(tmpdir(), 'maquette-chat-doc-'))
  const file = join(dir, 'scène chat.maquette')
  copyFileSync(resolve('e2e/fixtures/scene.maquette'), file)
  const userData = mkdtempSync(join(tmpdir(), 'maquette-chat-data-'))
  const log = join(dir, 'fake-claude.log')
  const pipe = `\\\\.\\pipe\\maquette-chat-e2e-${process.pid}-${Date.now()}`
  return { dir, file, userData, log, env: { MAQUETTE_CLAUDE_CMD: FAKE_CLAUDE, FAKE_CLAUDE_LOG: log, MAQUETTE_USER_DATA: userData, MAQUETTE_PIPE: pipe, ...extra } }
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
