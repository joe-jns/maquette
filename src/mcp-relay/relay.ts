import { spawn } from 'node:child_process'
import { basename, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pipePath, readToken, userDataDir } from '../mcp/pipe'
import { connectBridge } from '../mcp/pipeClient'
import { MCP_INSTRUCTIONS } from '../mcp/design/instructions'
import { TOOLS, type ToolResult } from '../mcp/tools'

/**
 * Relais MCP lancé par Claude Code (stdio). Il ne fait aucun travail lui-même : chaque appel est
 * transmis à l'app ouverte par le pipe nommé, avec le jeton de l'utilisateur. App fermée : il la lance
 * sans fenêtre et attend qu'elle réponde.
 * Exécuté par l'exécutable d'Electron en mode Node (ELECTRON_RUN_AS_NODE=1).
 */

const APP_CLOSED = 'Maquette n’est pas ouverte : lancez l’app puis réessayez.'
const TOKEN_REFUSED = 'Jeton refusé : reconnectez Maquette à Claude Code (menu Fichier → Connecter à Claude Code).'

const CUT = 'La connexion avec Maquette a été coupée pendant l’opération : vérifiez avec lire_document avant de recommencer.'

type Bridge = Awaited<ReturnType<typeof connectBridge>>
/** Une seule connexion, partagée par les appels simultanés (promesse unique pendant la connexion). */
let bridge: Promise<Bridge> | null = null

function getBridge(): Promise<Bridge> {
  bridge ??= (async () => {
    const token = await readToken(userDataDir())
    if (!token) throw Object.assign(new Error(APP_CLOSED), { code: 'APP_FERMEE' })
    return connectBridge({ path: pipePath(), token })
  })()
  bridge.catch(() => (bridge = null))
  return bridge
}

function drop(client: Bridge): void {
  client.close()
  if (bridge) void bridge.then((b) => b === client && (bridge = null), () => undefined)
}

/** Appels qui modifient le document : jamais rejoués après une coupure (ils ont pu être appliqués). */
const mutates = (tool: string, args: Record<string, unknown>) =>
  tool === 'appliquer' || args.appliquer === true || (tool === 'images' && args.poser !== undefined)

function failure(e: unknown, sent: boolean, mutating: boolean): ToolResult {
  const code = (e as { code?: string }).code
  if (code === 'JETON_REFUSE') return { text: TOKEN_REFUSED, isError: true }
  if (code === 'APP_FERMEE') return { text: sent && mutating ? CUT : APP_CLOSED, isError: true }
  return { text: `Erreur : ${(e as Error).message}`, isError: true }
}

const STARTING = 'Maquette démarre encore'
/** Temps laissé à Maquette pour démarrer sans fenêtre avant d'abandonner. */
const START_TIMEOUT_MS = 30_000
let launching: Promise<void> | null = null

/**
 * App fermée : le relais la lance lui-même, sans fenêtre (MAQUETTE_HEADLESS), puis attend qu'elle réponde.
 * En développement l'exécutable est celui d'Electron (on lui donne le dossier de l'app), une fois installée
 * c'est Maquette.exe. MAQUETTE_NO_AUTOSTART=1 garde l'ancien comportement (message « pas ouverte »).
 */
function launchHeadless(): Promise<void> {
  launching ??= (async () => {
    const exe = process.execPath
    const dev = /^electron(\.exe)?$/i.test(basename(exe))
    const env: NodeJS.ProcessEnv = { ...process.env, MAQUETTE_HEADLESS: '1' }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(exe, dev ? [resolve(__dirname, '..', '..')] : [], { env, detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
  })()
  return launching
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Appel avec démarrage de l'app si elle est fermée : on attend qu'elle soit prête, sans rejouer une modification. */
async function callStarting(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  let result = await call(tool, args)
  const closed = () => result.isError === true && result.text === APP_CLOSED
  const starting = () => result.isError === true && result.text.startsWith(STARTING)
  if (!(closed() || starting()) || process.env.MAQUETTE_NO_AUTOSTART === '1') return result
  if (closed()) await launchHeadless()
  const until = Date.now() + START_TIMEOUT_MS
  while ((closed() || starting()) && Date.now() < until) {
    await sleep(500)
    result = await call(tool, args)
  }
  return closed() ? { text: 'Maquette n’a pas pu démarrer sans fenêtre : ouvrez l’app puis réessayez.', isError: true } : result
}

async function call(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  const mutating = mutates(tool, args)
  for (let attempt = 0; attempt < 2; attempt++) {
    let client: Bridge
    try {
      client = await getBridge()
    } catch (e) {
      return failure(e, false, mutating)
    }
    // Connexion morte (app relancée) : rien n'a été envoyé, on en ouvre une neuve.
    if (!client.isOpen()) {
      drop(client)
      continue
    }
    try {
      return await client.call(tool, args)
    } catch (e) {
      const code = (e as { code?: string }).code
      // Seule une connexion perdue est fermée : un délai ne concerne que cet appel.
      if (code === 'APP_FERMEE' || code === 'PROTOCOLE') drop(client)
      // Un lot peut avoir été appliqué avant la coupure : jamais rejoué. Une lecture, si.
      if (code === 'APP_FERMEE' && attempt === 0 && !mutating) continue
      return failure(e, true, mutating)
    }
  }
  return { text: APP_CLOSED, isError: true }
}

async function main(): Promise<void> {
  // Les instructions résument la méthode de design pour Claude Code hors de l'app.
  const server = new McpServer({ name: 'maquette', version: '0.1.0' }, { instructions: MCP_INSTRUCTIONS })

  for (const tool of TOOLS) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.input }, async (args: unknown) => {
      const result = await callStarting(tool.name, (args ?? {}) as Record<string, unknown>)
      const content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] = [
        { type: 'text', text: result.text },
      ]
      if (result.image) content.push({ type: 'image', data: result.image.data, mimeType: result.image.mimeType })
      // Plusieurs images : chacune précédée de sa légende.
      for (const img of result.images ?? []) {
        content.push({ type: 'text', text: img.caption }, { type: 'image', data: img.data, mimeType: img.mimeType })
      }
      return { content, isError: result.isError ?? false }
    })
  }

  await server.connect(new StdioServerTransport())
}

void main()
