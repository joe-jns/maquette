import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'

/** Réponse d'un outil MCP (sera unifiée avec la définition de src/mcp/tools.ts). */
export interface ToolResult {
  text: string
  image?: { data: string; mimeType: string }
  isError?: boolean
}

/** Une ligne plus longue que ceci (20 Mo) ferme la connexion : protège la mémoire des deux côtés. */
export const MAX_LINE_BYTES = 20 * 1024 * 1024

const TOKEN_RE = /^[0-9a-f]{64}$/

function currentUser(): string {
  try {
    return userInfo().username
  } catch {
    return process.env.USERNAME ?? process.env.USER ?? 'utilisateur'
  }
}

/** Chemin du pipe nommé de l'app (un par utilisateur de la machine). */
export function pipePath(user?: string): string {
  const fromEnv = process.env.MAQUETTE_PIPE
  if (fromEnv) return fromEnv
  const clean = (user ?? currentUser()).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'utilisateur'
  return process.platform === 'win32' ? `\\\\.\\pipe\\maquette-${clean}` : join(tmpdir(), `maquette-${clean}.sock`)
}

/** Dossier de données de l'app, calculé sans Electron (le relais n'a pas `app.getPath`). */
export function userDataDir(): string {
  const fromEnv = process.env.MAQUETTE_USER_DATA
  if (fromEnv) return fromEnv
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'maquette')
  }
  return join(homedir(), '.config', 'maquette')
}

export function tokenPath(dir: string): string {
  return join(dir, 'mcp-token')
}

/** Jeton lu sur disque, ou null s'il est absent ou mal formé. */
export async function readToken(dir: string): Promise<string | null> {
  try {
    const t = (await readFile(tokenPath(dir), 'utf8')).trim()
    return TOKEN_RE.test(t) ? t : null
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

/** Jeton existant, sinon 32 octets aléatoires écrits dans `<dir>/mcp-token`. */
export async function ensureToken(dir: string): Promise<string> {
  const existing = await readToken(dir)
  if (existing) return existing
  await mkdir(dir, { recursive: true })
  const fresh = randomBytes(32).toString('hex')
  try {
    // 'wx' : si deux processus créent le jeton en même temps, un seul gagne.
    await writeFile(tokenPath(dir), fresh, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    return fresh
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
  }
  const raced = await readToken(dir)
  if (raced) return raced
  // Fichier présent mais illisible comme jeton : on le remplace.
  await writeFile(tokenPath(dir), fresh, { encoding: 'utf8', mode: 0o600 })
  return fresh
}

/** Compare deux jetons à temps constant ; des longueurs différentes sont un refus. */
export function tokensEqual(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function encodeLine(message: unknown): string {
  return `${JSON.stringify(message)}\n`
}

/**
 * Découpe un flux en lignes terminées par `\n`. Une ligne peut arriver en plusieurs paquets
 * et un paquet contenir plusieurs lignes. Les morceaux sont gardés tels quels et assemblés
 * une seule fois par ligne (pas de concaténation répétée pour les réponses de plusieurs Mo).
 * Dépasser `maxBytes` sans fin de ligne appelle `onOverflow` et ignore la suite.
 */
export function createLineReader(
  onLine: (line: string) => void,
  onOverflow: () => void,
  maxBytes = MAX_LINE_BYTES,
): (chunk: Buffer) => void {
  let parts: Buffer[] = []
  let size = 0
  let dead = false
  return (chunk) => {
    if (dead) return
    let start = 0
    for (;;) {
      const nl = chunk.indexOf(0x0a, start)
      if (nl === -1) break
      const piece = chunk.subarray(start, nl)
      if (size + piece.length > maxBytes) {
        dead = true
        parts = []
        onOverflow()
        return
      }
      const line = parts.length ? Buffer.concat([...parts, piece], size + piece.length) : piece
      parts = []
      size = 0
      start = nl + 1
      onLine(line.toString('utf8'))
      if (dead) return
    }
    if (start < chunk.length) {
      const rest = chunk.subarray(start)
      size += rest.length
      if (size > maxBytes) {
        dead = true
        parts = []
        onOverflow()
        return
      }
      parts.push(rest)
    }
  }
}

/** Analyse une ligne JSON ; renvoie undefined si elle n'est pas un objet. */
export function parseMessage(line: string): Record<string, unknown> | undefined {
  try {
    const v: unknown = JSON.parse(line)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}
