import { connect } from 'node:net'
import { createLineReader, encodeLine, MAX_LINE_BYTES, parseMessage, type ToolResult } from './pipe'

export type BridgeErrorCode = 'APP_FERMEE' | 'JETON_REFUSE' | 'DELAI' | 'PROTOCOLE'

export class BridgeError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BridgeError'
  }
}

const MESSAGES: Record<BridgeErrorCode, string> = {
  APP_FERMEE: "Maquette n'est pas ouverte",
  JETON_REFUSE: 'Jeton refusé par Maquette (reconnecter Maquette à Claude Code)',
  DELAI: 'Maquette ne répond pas (délai dépassé)',
  PROTOCOLE: 'Réponse illisible de Maquette',
}

const bridgeError = (code: BridgeErrorCode) => new BridgeError(code, MESSAGES[code])

/** Codes système qui veulent dire « personne n'écoute au bout du pipe ». */
const CLOSED_CODES = new Set(['ENOENT', 'ECONNREFUSED', 'EPIPE', 'ECONNRESET'])

export interface BridgeClient {
  call(tool: string, args: Record<string, unknown>): Promise<ToolResult>
  /** Faux dès que la connexion est coupée (app fermée ou relancée). */
  isOpen(): boolean
  close(): void
}

interface Pending {
  resolve(r: ToolResult): void
  reject(e: Error): void
  timer: ReturnType<typeof setTimeout>
}

function isToolResult(v: unknown): v is ToolResult {
  return !!v && typeof v === 'object' && typeof (v as ToolResult).text === 'string'
}

/** Rejoint l'app par son pipe nommé et s'authentifie avec le jeton. */
export function connectBridge(opts: { path: string; token: string; timeoutMs?: number; maxLineBytes?: number }): Promise<BridgeClient> {
  const timeoutMs = opts.timeoutMs ?? 30000
  return new Promise<BridgeClient>((resolveConnect, rejectConnect) => {
    const socket = connect(opts.path)
    const pending = new Map<number | string, Pending>()
    let nextId = 1
    let ready = false
    let ended: BridgeError | undefined

    /** Termine la connexion une seule fois : rejette la poignée de main ou les appels en cours. */
    const finish = (err: BridgeError) => {
      if (ended) return
      ended = err
      clearTimeout(helloTimer)
      socket.destroy()
      if (!ready) rejectConnect(err)
      for (const p of pending.values()) {
        clearTimeout(p.timer)
        p.reject(err)
      }
      pending.clear()
    }

    const helloTimer = setTimeout(() => finish(bridgeError('DELAI')), timeoutMs)

    const onLine = (line: string) => {
      const msg = parseMessage(line)
      if (!msg) return finish(bridgeError('PROTOCOLE'))
      if (!ready) {
        if (msg.ok === true) {
          ready = true
          clearTimeout(helloTimer)
          resolveConnect(client)
        } else {
          finish(msg.error === 'jeton invalide' ? bridgeError('JETON_REFUSE') : bridgeError('PROTOCOLE'))
        }
        return
      }
      const id = msg.id as number | string | undefined
      const p = id === undefined ? undefined : pending.get(id)
      if (!p) {
        // Erreur sans id : le serveur a rejeté la connexion.
        if (id === undefined) finish(bridgeError('PROTOCOLE'))
        return
      }
      pending.delete(id!)
      clearTimeout(p.timer)
      if (typeof msg.error === 'string') p.reject(new Error(msg.error))
      else if (isToolResult(msg.result)) p.resolve(msg.result)
      else p.reject(bridgeError('PROTOCOLE'))
    }

    socket.on('connect', () => socket.write(encodeLine({ hello: opts.token })))
    socket.on('data', createLineReader(onLine, () => finish(bridgeError('PROTOCOLE')), opts.maxLineBytes ?? MAX_LINE_BYTES))
    socket.on('error', (e: NodeJS.ErrnoException) => {
      // Avant la poignée de main, toute erreur de pipe veut dire que l'app n'est pas joignable.
      if (!ready || CLOSED_CODES.has(e.code ?? '')) finish(bridgeError('APP_FERMEE'))
      else finish(new BridgeError('APP_FERMEE', `${MESSAGES.APP_FERMEE} (${e.message})`))
    })
    socket.on('close', () => finish(bridgeError('APP_FERMEE')))

    const client: BridgeClient = {
      call(tool, args) {
        if (ended) return Promise.reject(ended)
        const id = nextId++
        return new Promise<ToolResult>((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(id)
            reject(bridgeError('DELAI'))
          }, timeoutMs)
          pending.set(id, { resolve, reject, timer })
          socket.write(encodeLine({ id, tool, args }))
        })
      },
      isOpen: () => !ended,
      close() {
        finish(bridgeError('APP_FERMEE'))
      },
    }
  })
}
