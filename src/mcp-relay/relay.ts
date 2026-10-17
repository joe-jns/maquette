import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pipePath, readToken, userDataDir } from '../mcp/pipe'
import { connectBridge } from '../mcp/pipeClient'
import { MCP_INSTRUCTIONS } from '../mcp/design/instructions'
import { TOOLS, type ToolResult } from '../mcp/tools'

/**
 * Relais MCP lancé par Claude Code (stdio). Il ne fait aucun travail lui-même : chaque appel est
 * transmis à l'app ouverte par le pipe nommé, avec le jeton de l'utilisateur.
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
const mutates = (tool: string, args: Record<string, unknown>) => tool === 'appliquer' || args.appliquer === true

function failure(e: unknown, sent: boolean, mutating: boolean): ToolResult {
  const code = (e as { code?: string }).code
  if (code === 'JETON_REFUSE') return { text: TOKEN_REFUSED, isError: true }
  if (code === 'APP_FERMEE') return { text: sent && mutating ? CUT : APP_CLOSED, isError: true }
  return { text: `Erreur : ${(e as Error).message}`, isError: true }
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
      const result = await call(tool.name, (args ?? {}) as Record<string, unknown>)
      const content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] = [
        { type: 'text', text: result.text },
      ]
      if (result.image) content.push({ type: 'image', data: result.image.data, mimeType: result.image.mimeType })
      return { content, isError: result.isError ?? false }
    })
  }

  await server.connect(new StdioServerTransport())
}

void main()
