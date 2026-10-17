import { connect, createServer, type Socket } from 'node:net'
import { rm } from 'node:fs/promises'
import { createLineReader, encodeLine, MAX_LINE_BYTES, parseMessage, tokensEqual, type ToolResult } from '../mcp/pipe'

export interface BridgeOptions {
  path: string
  token: string
  handle(tool: string, args: Record<string, unknown>): Promise<ToolResult>
  /** Délai pour envoyer `{"hello":…}` après la connexion (5 s). */
  authTimeoutMs?: number
  maxLineBytes?: number
}

export interface Bridge {
  close(): Promise<void>
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Sous Unix, un socket orphelin (app plantée) bloque l'écoute : on le retire s'il ne répond plus. */
async function removeStaleSocket(path: string): Promise<boolean> {
  if (process.platform === 'win32') return false
  const alive = await new Promise<boolean>((resolve) => {
    const probe = connect(path)
    probe.once('connect', () => {
      probe.destroy()
      resolve(true)
    })
    probe.once('error', () => resolve(false))
  })
  if (alive) return false
  await rm(path, { force: true })
  return true
}

/**
 * Serveur du canal app ↔ relais, sur un pipe nommé local. Protocole en lignes JSON :
 * le client envoie d'abord `{"hello":"<jeton>"}` (réponse `{"ok":true}` ou `{"error":"jeton invalide"}`
 * suivie de la fermeture), puis des `{"id","tool","args"}` auxquels répondent `{"id","result"}`
 * ou `{"id","error"}`, dans l'ordre où les outils finissent.
 */
export async function startBridge(opts: BridgeOptions): Promise<Bridge> {
  const authTimeoutMs = opts.authTimeoutMs ?? 5000
  const maxLineBytes = opts.maxLineBytes ?? MAX_LINE_BYTES
  const sockets = new Set<Socket>()

  const server = createServer((socket) => {
    sockets.add(socket)
    let authed = false
    let closing = false

    const send = (message: unknown) => {
      if (!socket.destroyed && socket.writable) socket.write(encodeLine(message))
    }
    const refuse = (message: string) => {
      closing = true
      send({ error: message })
      socket.end()
      // Un client qui ne ferme pas son côté ne garde pas la connexion ouverte.
      setTimeout(() => socket.destroy(), 1000).unref()
    }

    const authTimer = setTimeout(() => {
      closing = true
      socket.destroy()
    }, authTimeoutMs)

    const onLine = (line: string) => {
      if (closing) return
      const msg = parseMessage(line)
      if (!authed) {
        if (msg && tokensEqual(msg.hello, opts.token)) {
          authed = true
          clearTimeout(authTimer)
          send({ ok: true })
        } else {
          clearTimeout(authTimer)
          refuse('jeton invalide')
        }
        return
      }
      const id = msg?.id
      if (typeof id !== 'number' && typeof id !== 'string') {
        refuse('requête invalide')
        return
      }
      const tool = msg?.tool
      const rawArgs = msg?.args
      if (typeof tool !== 'string' || (rawArgs !== undefined && (typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs)))) {
        send({ id, error: 'requête invalide' })
        return
      }
      const args = (rawArgs ?? {}) as Record<string, unknown>
      Promise.resolve()
        .then(() => opts.handle(tool, args))
        .then(
          (result) => send({ id, result }),
          (e: unknown) => send({ id, error: errorMessage(e) }),
        )
    }

    const read = createLineReader(onLine, () => {
      closing = true
      socket.destroy()
    }, maxLineBytes)

    socket.on('data', read)
    // Erreurs de pipe (client parti brutalement) : rien à faire, 'close' suit.
    socket.on('error', () => undefined)
    socket.on('close', () => {
      clearTimeout(authTimer)
      sockets.delete(socket)
    })
  })

  const listen = () =>
    new Promise<void>((resolve, reject) => {
      const onError = (e: Error) => {
        server.off('listening', onListening)
        reject(e)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(opts.path)
    })

  try {
    await listen()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE' || !(await removeStaleSocket(opts.path))) throw e
    await listen()
  }
  // Après le démarrage, une erreur du serveur ne doit pas faire planter l'app.
  server.on('error', () => undefined)

  let closed: Promise<void> | undefined
  return {
    close() {
      closed ??= new Promise<void>((resolve) => {
        server.close(() => resolve())
        for (const s of sockets) s.destroy()
        sockets.clear()
      })
      return closed
    },
  }
}
