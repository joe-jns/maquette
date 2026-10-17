import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { ChatEvent, ChatImage, ChatItem, ChatSend, PermissionDecision } from '../../shared/chat'
import { createLineReader } from '../../mcp/pipe'
import { imageHashes, type ChatImages } from './chatImages'
import { chatKey, type ChatStore } from './chatStore'
import { claudeArgs, claudeCommand, NOT_FOUND_CODES, NOT_FOUND_TEXT } from './command'
import { createDecoder, interruptLine, permissionLine, userLine, type ClaudeAction } from './protocol'

const NOT_INSTALLED = 'Claude Code n’est pas installé sur cet ordinateur (commande « claude » introuvable). Installez-le puis réessayez.'
const DIED = 'Claude Code s’est arrêté pendant la réponse. Votre prochain message reprendra la conversation.'
const RESUME_LOST = 'La conversation précédente n’a pas pu être reprise ; nouvelle conversation.'
/** Sans `result` après un Stop, on coupe le processus. */
const STOP_TIMEOUT_MS = 5000

export interface ChatSessionDeps {
  store: ChatStore
  /** Vignettes des images jointes et des images vues par Claude. */
  images: ChatImages
  /** Dossier des fichiers du chat (configuration MCP, consigne). */
  userData: string
  /** Relais MCP (out/main/relay.js, dans l'archive de l'app une fois installée). */
  relayPath: string
  emit(event: ChatEvent): void
}

interface Running {
  proc: ChildProcess
  /** Fin voulue (changement de conversation, fermeture) : pas de message d'erreur. */
  killed: boolean
  /** Réponse « conversation introuvable » à notre --resume. */
  resumeFailed: boolean
  stderr: string
}

interface Pending { item: Extract<ChatItem, { kind: 'permission' }>; input: unknown }

let nextId = 1
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${nextId++}`

/** Consigne ajoutée à celle de Claude Code. */
export function systemPrompt(docName: string): string {
  return [
    'Tu es intégré à Maquette, un éditeur de maquettes de sites (comme Figma).',
    `Document ouvert : ${docName}.`,
    'Lis-le et modifie-le avec les outils maquette (lire_document, chercher, lire_elements, appliquer, capture, verifier_gout).',
    'Chaque appel à appliquer = une seule annulation (Ctrl+Z) pour l’utilisateur.',
    'L’utilisateur regarde le canevas pendant que tu travailles : construis une grande demande (page, landing) section par section, un appel à appliquer par section (hero, puis la suivante…), jamais tout en un seul appel.',
    'Réponds en français simple et court.',
  ].join('\n')
}

/** Termine le processus et ses enfants (sous Windows, cmd lance claude : tuer cmd seul ne suffit pas). */
function killTree(proc: ChildProcess): void {
  if (proc.exitCode !== null || proc.signalCode !== null) return
  if (process.platform === 'win32' && proc.pid) {
    execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => undefined)
  } else proc.kill()
}

/** Conversation avec `claude` pour une fenêtre de l'éditeur. */
export class ChatSession {
  private key = chatKey(null)
  private path: string | null = null
  private sessionId: string | null = null
  private run: Running | null = null
  private busy = false
  private stopping: ReturnType<typeof setTimeout> | null = null
  private lastLine: string | null = null
  private readonly pending = new Map<string, Pending>()
  /** Outils autorisés « toujours » pour cette conversation. */
  private readonly always = new Set<string>()
  /** Textes reçus au fil de l'eau sans message complet (enregistrés à la fin du tour). */
  private readonly partial = new Map<string, string>()
  private readonly id = nextId++
  /** Change à chaque arrêt : un lancement en cours pour l'ancienne conversation est abandonné. */
  private generation = 0

  constructor(private readonly deps: ChatSessionDeps) {}

  /** Conversation du fichier : arrête l'autre s'il y en avait une, renvoie l'historique. */
  async open(path: string | null): Promise<ChatItem[]> {
    const key = chatKey(path)
    if (key !== this.key) this.kill()
    this.key = key
    this.path = path
    const conv = await this.deps.store.get(key)
    this.sessionId = conv.sessionId
    return conv.items
  }

  send(message: ChatSend): void {
    if (this.busy) return
    const user: ChatItem = { kind: 'user', id: uid('u'), text: message.text, images: message.images.length }
    this.item(user, true)
    if (message.images.length) this.attachThumbs(user, message.images, 'thumbs')
    this.setBusy(true)
    this.lastLine = userLine(message)
    void this.write(this.lastLine)
  }

  stop(): void {
    if (!this.busy || !this.run) return
    this.denyPending(true)
    this.writeNow(interruptLine(uid('stop')))
    this.stopping ??= setTimeout(() => {
      // Pas de fin de tour : on coupe, le prochain message reprendra avec --resume.
      this.kill()
    }, STOP_TIMEOUT_MS)
  }

  permission(requestId: string, decision: PermissionDecision): void {
    const p = this.pending.get(requestId)
    if (!p) return
    this.pending.delete(requestId)
    if (decision === 'always') this.always.add(p.item.tool)
    const allow = decision !== 'deny'
    this.writeNow(permissionLine(requestId, allow ? 'allow' : 'deny', p.input))
    this.item({ ...p.item, status: allow ? 'allowed' : 'denied' }, true)
  }

  /** Nouvelle conversation pour le fichier courant : ses vignettes partent avec elle (sauf celles d'une autre conversation). */
  async reset(): Promise<void> {
    this.kill()
    this.sessionId = null
    const { store, images } = this.deps
    const used = imageHashes((await store.get(this.key)).items)
    await store.reset(this.key)
    if (!used.length) return
    const elsewhere = await store.images()
    await images.remove(used.filter((h) => !elsewhere.has(h)))
  }

  /**
   * Vignettes des images d'un élément, enregistrées à part : l'élément est renvoyé avec elles quand elles
   * sont prêtes (sauf si la conversation a changé entre-temps).
   */
  private attachThumbs(item: ChatItem, raw: ChatImage[], field: 'thumbs' | 'images'): void {
    const generation = this.generation
    void this.deps.images.saveAll(raw).then((refs) => {
      if (!refs.length || generation !== this.generation) return
      this.item({ ...item, [field]: refs } as ChatItem, true)
    })
  }

  /** Fenêtre fermée ou rechargée, changement de conversation, fin de l'app. */
  kill(): void {
    this.generation++
    this.denyPending(false)
    this.always.clear()
    const run = this.run
    this.run = null
    if (run) {
      run.killed = true
      run.proc.stdin?.end()
      killTree(run.proc)
    }
    this.endTurn()
  }

  private async write(line: string): Promise<void> {
    const generation = this.generation
    if (!this.run) await this.start(generation)
    if (generation === this.generation) this.writeNow(line)
  }

  private writeNow(line: string): void {
    this.run?.proc.stdin?.write(line)
  }

  private async start(generation: number): Promise<void> {
    const { userData, relayPath } = this.deps
    await mkdir(userData, { recursive: true })
    const mcpConfig = join(userData, 'chat-mcp.json')
    const env: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' }
    if (process.env.MAQUETTE_USER_DATA) env.MAQUETTE_USER_DATA = process.env.MAQUETTE_USER_DATA
    if (process.env.MAQUETTE_PIPE) env.MAQUETTE_PIPE = process.env.MAQUETTE_PIPE
    await writeFile(mcpConfig, JSON.stringify({ mcpServers: { maquette: { command: process.execPath, args: [relayPath], env } } }, null, 2), 'utf8')
    const promptFile = join(userData, `chat-consigne-${this.id}.txt`)
    await writeFile(promptFile, systemPrompt(this.path ? basename(this.path) : 'Sans titre'), 'utf8')
    if (generation !== this.generation || this.run) return

    const cmd = claudeCommand(claudeArgs({ mcpConfig, promptFile, resume: this.sessionId }), process.platform, process.env.MAQUETTE_CLAUDE_CMD)
    // Lancé depuis une session Claude Code (développement) : claude ne doit pas se croire imbriqué.
    const childEnv = { ...process.env }
    delete childEnv.CLAUDECODE
    delete childEnv.ELECTRON_RUN_AS_NODE
    const proc = spawn(cmd.file, cmd.args, {
      cwd: this.path ? dirname(this.path) : homedir(),
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: cmd.verbatim,
    })
    const run: Running = { proc, killed: false, resumeFailed: false, stderr: '' }
    this.run = run
    const decode = createDecoder()
    proc.stdin.on('error', () => undefined)
    proc.stdout.on('data', createLineReader((line) => {
      if (this.run === run) for (const action of decode(line)) this.handle(action, run)
    }, () => undefined))
    proc.stderr.on('data', (d: Buffer) => {
      if (run.stderr.length < 4000) run.stderr += d.toString('utf8')
    })
    proc.on('error', (e: NodeJS.ErrnoException) => this.exited(run, e.code === 'ENOENT' ? 127 : 1))
    proc.on('exit', (code) => this.exited(run, code ?? 1))
  }

  private exited(run: Running, code: number): void {
    if (this.run !== run) return
    this.run = null
    if (run.killed) return
    this.denyPending(false)
    if (NOT_FOUND_CODES.includes(code) || NOT_FOUND_TEXT.test(run.stderr)) {
      this.error(NOT_INSTALLED)
      this.endTurn()
      return
    }
    if (run.resumeFailed && this.lastLine) {
      // La conversation demandée n'existe plus : on repart sans --resume avec le même message.
      this.sessionId = null
      void this.deps.store.setSession(this.key, null)
      this.error(RESUME_LOST)
      void this.write(this.lastLine)
      return
    }
    if (this.busy) {
      const detail = run.stderr.trim().split('\n').at(-1)
      this.error(detail ? `${DIED}\n${detail}` : DIED)
    }
    this.endTurn()
  }

  private handle(action: ClaudeAction, run: Running): void {
    switch (action.type) {
      case 'session':
        this.sessionId = action.sessionId
        void this.deps.store.setSession(this.key, action.sessionId)
        return
      case 'delta':
        this.partial.set(action.id, (this.partial.get(action.id) ?? '') + action.text)
        this.deps.emit({ type: 'delta', id: action.id, text: action.text })
        return
      case 'item': {
        const item = action.item
        if (item.kind === 'assistant') this.partial.delete(item.id)
        this.item(item, !(item.kind === 'tool' && item.status === 'running'))
        if (action.images?.length) this.attachThumbs(item, action.images, 'images')
        return
      }
      case 'permission': {
        if (this.always.has(action.tool)) {
          this.writeNow(permissionLine(action.requestId, 'allow', action.input))
          return
        }
        const item = { kind: 'permission' as const, id: `perm-${action.requestId}`, requestId: action.requestId, tool: action.tool, summary: action.summary, status: 'asking' as const }
        this.pending.set(action.requestId, { item, input: action.input })
        this.item(item, false)
        return
      }
      case 'end':
        if (action.resumeFailed) {
          // Le processus va s'arrêter ; la relance se fait à sa sortie (exited).
          run.resumeFailed = true
          return
        }
        if (action.sessionId && action.sessionId !== this.sessionId) {
          this.sessionId = action.sessionId
          void this.deps.store.setSession(this.key, action.sessionId)
        }
        if (action.isError && !this.stopping) this.error(action.text)
        this.endTurn()
    }
  }

  /** Fin du tour : textes partiels gardés, Stop terminé, état « attend un message ». */
  private endTurn(): void {
    for (const [id, text] of this.partial) void this.deps.store.appendOrReplace(this.key, { kind: 'assistant', id, text })
    this.partial.clear()
    if (this.stopping) clearTimeout(this.stopping)
    this.stopping = null
    this.setBusy(false)
  }

  /** Refuse les demandes en attente ; `answer` : le dire à claude (sinon il est déjà arrêté). */
  private denyPending(answer: boolean): void {
    for (const [requestId, p] of this.pending) {
      if (answer) this.writeNow(permissionLine(requestId, 'deny', p.input))
      this.item({ ...p.item, status: 'denied' }, true)
    }
    this.pending.clear()
  }

  private error(text: string): void {
    this.item({ kind: 'error', id: uid('e'), text }, true)
  }

  private item(item: ChatItem, persist: boolean): void {
    this.deps.emit({ type: 'item', item })
    if (persist) void this.deps.store.appendOrReplace(this.key, item)
  }

  private setBusy(busy: boolean): void {
    if (this.busy === busy) return
    this.busy = busy
    this.deps.emit({ type: 'busy', busy })
  }
}
