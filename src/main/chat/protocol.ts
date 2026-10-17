/**
 * Protocole de `claude -p --input-format stream-json --output-format stream-json` : code pur.
 * Les lignes de sortie deviennent des actions pour le chat ; les encodeurs fabriquent nos lignes d'entrée.
 */
import type { ChatItem, ChatSend } from '../../shared/chat'

export type ClaudeAction =
  /** Identifiant de la conversation côté Claude Code (pour --resume). */
  | { type: 'session'; sessionId: string }
  /** Texte qui arrive au fil de l'eau pour l'élément assistant `id`. */
  | { type: 'delta'; id: string; text: string }
  /** Élément nouveau ou remplacé (assistant complet, outil lancé ou terminé). */
  | { type: 'item'; item: ChatItem }
  /** Claude demande l'accord pour un outil. */
  | { type: 'permission'; requestId: string; tool: string; input: unknown; summary: string }
  /** Fin du tour. resumeFailed : la conversation demandée par --resume n'existe pas. */
  | { type: 'end'; isError: boolean; text: string; sessionId: string | null; resumeFailed: boolean }

type Json = Record<string, unknown>

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

const MCP_PREFIX = 'mcp__maquette__'

/** Nom d'outil lisible : les outils de Maquette sans leur préfixe. */
export function toolName(name: string): string {
  return name.startsWith(MCP_PREFIX) ? name.slice(MCP_PREFIX.length) : name
}

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** Détail d'un appel d'outil en une ligne courte (sans le nom de l'outil, affiché à côté) ; vide s'il n'y en a pas. */
export function toolSummary(name: string, input: unknown): string {
  const short = toolName(name)
  const args = isObj(input) ? input : {}
  if (short === 'appliquer') {
    const ops = Array.isArray(args.operations) ? args.operations : Array.isArray(args.ops) ? args.ops : null
    if (ops) return `${ops.length} opération${ops.length > 1 ? 's' : ''}`
  }
  const first = (...keys: string[]) => keys.map((k) => str(args[k])).find((v) => v !== undefined)
  const detail =
    short === 'Bash' || short === 'PowerShell' ? first('command')
    : ['Read', 'Edit', 'Write', 'NotebookEdit'].includes(short) ? first('file_path', 'notebook_path')
    : short === 'WebFetch' ? first('url')
    : short === 'WebSearch' ? first('query')
    : short === 'Glob' || short === 'Grep' ? first('pattern')
    : undefined
  return detail ? cut(detail.replace(/\s+/g, ' ').trim(), 80) : ''
}

const RESUME_FAILED = /No conversation found/i

/**
 * Décodeur d'une session `claude` : garde ce qu'il faut entre les lignes (blocs de texte reçus au fil
 * de l'eau, outils en cours) pour relier les morceaux au message complet qui suit.
 */
export function createDecoder(): (line: string) => ClaudeAction[] {
  /** Par message : index des blocs de texte vus au fil de l'eau, dans l'ordre, et blocs complets déjà reçus. */
  const messages = new Map<string, { streamed: number[]; done: number }>()
  const tools = new Map<string, { name: string; summary: string }>()
  let current: string | null = null

  const message = (id: string) => {
    let m = messages.get(id)
    if (!m) messages.set(id, (m = { streamed: [], done: 0 }))
    return m
  }

  return (line) => {
    let msg: unknown
    try {
      msg = JSON.parse(line)
    } catch {
      return []
    }
    if (!isObj(msg)) return []
    // Les messages des sous-agents (Task) ne sont pas affichés : seul le fil principal compte.
    if (msg.parent_tool_use_id) return []

    switch (msg.type) {
      case 'system': {
        const sessionId = str(msg.session_id)
        return msg.subtype === 'init' && sessionId ? [{ type: 'session', sessionId }] : []
      }
      case 'stream_event': {
        const event = isObj(msg.event) ? msg.event : {}
        if (event.type === 'message_start') {
          current = (isObj(event.message) && str(event.message.id)) || str(msg.api_message_id) || current
          return []
        }
        const id = str(msg.api_message_id) ?? current
        if (!id || typeof event.index !== 'number') return []
        const index = event.index
        const m = message(id)
        if (event.type === 'content_block_start' && isObj(event.content_block) && event.content_block.type === 'text') {
          if (!m.streamed.includes(index)) m.streamed.push(index)
          return []
        }
        if (event.type === 'content_block_delta' && isObj(event.delta) && event.delta.type === 'text_delta') {
          const text = str(event.delta.text) ?? ''
          if (!m.streamed.includes(index)) m.streamed.push(index)
          return text ? [{ type: 'delta', id: `${id}:${index}`, text }] : []
        }
        return []
      }
      case 'assistant': {
        const body = isObj(msg.message) ? msg.message : {}
        const id = str(body.id)
        if (!id || !Array.isArray(body.content)) return []
        const m = message(id)
        const out: ClaudeAction[] = []
        for (const block of body.content) {
          if (!isObj(block)) continue
          if (block.type === 'text') {
            // Le n-ième bloc de texte complet correspond au n-ième bloc reçu au fil de l'eau.
            const k = m.done++
            const index = m.streamed[k]
            out.push({ type: 'item', item: { kind: 'assistant', id: index === undefined ? `${id}:a${k}` : `${id}:${index}`, text: str(block.text) ?? '' } })
          } else if (block.type === 'tool_use') {
            const toolId = str(block.id)
            const name = str(block.name) ?? 'outil'
            if (!toolId) continue
            const summary = toolSummary(name, block.input)
            tools.set(toolId, { name: toolName(name), summary })
            out.push({ type: 'item', item: { kind: 'tool', id: toolId, name: toolName(name), summary, status: 'running' } })
          }
        }
        return out
      }
      case 'user': {
        const body = isObj(msg.message) ? msg.message : {}
        if (!Array.isArray(body.content)) return []
        const out: ClaudeAction[] = []
        for (const block of body.content) {
          if (!isObj(block) || block.type !== 'tool_result') continue
          const toolId = str(block.tool_use_id)
          const known = toolId ? tools.get(toolId) : undefined
          if (!toolId || !known) continue
          tools.delete(toolId)
          out.push({ type: 'item', item: { kind: 'tool', id: toolId, ...known, status: block.is_error ? 'error' : 'done' } })
        }
        return out
      }
      case 'control_request': {
        const request = isObj(msg.request) ? msg.request : {}
        const requestId = str(msg.request_id)
        if (request.subtype !== 'can_use_tool' || !requestId) return []
        const tool = str(request.tool_name) ?? 'outil'
        return [{ type: 'permission', requestId, tool, input: request.input ?? {}, summary: toolSummary(tool, request.input) }]
      }
      case 'result': {
        const errors = Array.isArray(msg.errors) ? msg.errors.filter((e): e is string => typeof e === 'string') : []
        const isError = msg.is_error === true
        const text = str(msg.result) || errors.join(' ') || (isError ? `Erreur de Claude Code (${str(msg.subtype) ?? 'inconnue'}).` : '')
        messages.clear()
        current = null
        return [{ type: 'end', isError, text, sessionId: str(msg.session_id) ?? null, resumeFailed: isError && errors.some((e) => RESUME_FAILED.test(e)) }]
      }
      default:
        return []
    }
  }
}

const line = (message: unknown) => `${JSON.stringify(message)}\n`

/** Message de l'utilisateur : images d'abord, puis le texte (précédé du contexte s'il y en a un). */
export function userLine(send: ChatSend): string {
  const text = send.context.trim() ? `${send.context}\n\n${send.text}` : send.text
  const images = send.images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } }))
  return line({ type: 'user', message: { role: 'user', content: [...images, { type: 'text', text }] } })
}

/** Réponse à une demande d'accord : l'entrée d'origine est renvoyée telle quelle si c'est oui. */
export function permissionLine(requestId: string, behavior: 'allow' | 'deny', input: unknown): string {
  const response = behavior === 'allow' ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: "Refusé par l'utilisateur" }
  return line({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } })
}

/** Arrêt du tour en cours : `claude` répond puis termine le tour par un `result`. */
export function interruptLine(id: string): string {
  return line({ type: 'control_request', request_id: id, request: { subtype: 'interrupt' } })
}
