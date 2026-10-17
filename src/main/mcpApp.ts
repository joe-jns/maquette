import { BrowserWindow, ipcMain } from 'electron'
import { startBridge, type Bridge } from './mcpBridge'
import { ensureToken, pipePath, userDataDir, type ToolResult } from '../mcp/pipe'

const CALL_TIMEOUT_MS = 30_000

/**
 * Côté app de la connexion avec Claude Code : le canal (pipe nommé + jeton) reçoit les appels du
 * relais et les passe à la fenêtre de l'éditeur, où vit le document.
 */
export async function startMcp(editorWindow: () => BrowserWindow | undefined): Promise<Bridge | null> {
  const pending = new Map<number, (result: ToolResult) => void>()
  let nextId = 1
  // Fenêtres prêtes à recevoir les outils : document initial chargé (oubliées à chaque rechargement).
  const ready = new WeakSet<Electron.WebContents>()
  ipcMain.on('mcp:ready', (event, isReady: boolean) => {
    if (isReady) ready.add(event.sender)
    else ready.delete(event.sender)
  })
  ipcMain.on('mcp:result', (_event, id: number, result: ToolResult) => {
    pending.get(id)?.(result)
    pending.delete(id)
  })

  const handle = (tool: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const win = editorWindow()
    if (!win || win.webContents.isLoading() || !ready.has(win.webContents)) return Promise.resolve({ text: 'Maquette démarre encore : réessayez dans un instant.', isError: true })
    const id = nextId++
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve({ text: 'Maquette n’a pas répondu à temps (30 s).', isError: true })
      }, CALL_TIMEOUT_MS)
      pending.set(id, (result) => {
        clearTimeout(timer)
        resolve(result)
      })
      win.webContents.send('mcp:call', id, tool, args)
    })
  }

  try {
    const token = await ensureToken(userDataDir())
    return await startBridge({ path: pipePath(), token, handle })
  } catch (e) {
    // Pipe déjà pris (une autre Maquette écoute) : l'éditeur marche quand même, sans Claude Code.
    console.error(`Connexion Claude Code indisponible : ${(e as Error).message}`)
    return null
  }
}
