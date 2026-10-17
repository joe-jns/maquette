import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pipePath, readToken, userDataDir } from '../mcp/pipe'
import { connectBridge } from '../mcp/pipeClient'
import { TOOLS, type ToolResult } from '../mcp/tools'

/**
 * Relais MCP lancé par Claude Code (stdio). Il ne fait aucun travail lui-même : chaque appel est
 * transmis à l'app ouverte par le pipe nommé, avec le jeton de l'utilisateur.
 * Exécuté par l'exécutable d'Electron en mode Node (ELECTRON_RUN_AS_NODE=1).
 */

const APP_CLOSED = 'Maquette n’est pas ouverte : lancez l’app puis réessayez.'
const TOKEN_REFUSED = 'Jeton refusé : reconnectez Maquette à Claude Code (menu Fichier → Connecter à Claude Code).'

type Bridge = Awaited<ReturnType<typeof connectBridge>>
let bridge: Bridge | null = null

async function getBridge(): Promise<Bridge> {
  if (bridge) return bridge
  const token = await readToken(userDataDir())
  if (!token) throw Object.assign(new Error(APP_CLOSED), { code: 'APP_FERMEE' })
  bridge = await connectBridge({ path: pipePath(), token })
  return bridge
}

async function call(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await (await getBridge()).call(tool, args)
    } catch (e) {
      const code = (e as { code?: string }).code
      bridge?.close()
      bridge = null
      // Une connexion morte (app relancée) : une seconde tentative avec une connexion neuve.
      if (code === 'APP_FERMEE' && attempt === 0) continue
      if (code === 'APP_FERMEE') return { text: APP_CLOSED, isError: true }
      if (code === 'JETON_REFUSE') return { text: TOKEN_REFUSED, isError: true }
      return { text: `Erreur : ${(e as Error).message}`, isError: true }
    }
  }
  return { text: APP_CLOSED, isError: true }
}

async function main(): Promise<void> {
  const server = new McpServer({ name: 'maquette', version: '0.1.0' })

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
