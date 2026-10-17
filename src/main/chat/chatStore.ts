import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ChatItem } from '../../shared/chat'
import { imageHashes } from './chatImages'

/** Clé de la conversation d'un document sans titre. */
export const UNTITLED = 'sans-titre'
/** Éléments gardés par conversation (les plus anciens partent). */
export const MAX_ITEMS = 200

export interface Conversation { sessionId: string | null; items: ChatItem[] }
type Data = Record<string, Conversation>

export const chatKey = (path: string | null): string => path ?? UNTITLED

/**
 * Conversations enregistrées dans `chats.json` : une par fichier. Les écritures passent une à une et
 * remplacent le fichier d'un coup (fichier temporaire puis renommage) : jamais de JSON coupé en deux.
 */
export class ChatStore {
  private data: Data | null = null
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private readonly file: string) {}

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work)
    this.chain = run.catch(() => undefined)
    return run
  }

  private async load(): Promise<Data> {
    if (this.data) return this.data
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      this.data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Data) : {}
    } catch {
      // Absent ou abîmé : on repart d'un historique vide.
      this.data = {}
    }
    return this.data
  }

  private async save(): Promise<void> {
    const tmp = `${this.file}.tmp`
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(tmp, JSON.stringify(this.data ?? {}), 'utf8')
    await rename(tmp, this.file)
  }

  private change(key: string, edit: (c: Conversation) => Conversation | null): Promise<void> {
    return this.serial(async () => {
      const data = await this.load()
      const next = edit(data[key] ?? { sessionId: null, items: [] })
      if (next) data[key] = next
      else delete data[key]
      await this.save()
    })
  }

  get(key: string): Promise<Conversation> {
    return this.serial(async () => {
      const c = (await this.load())[key]
      return c ? { sessionId: c.sessionId ?? null, items: Array.isArray(c.items) ? [...c.items] : [] } : { sessionId: null, items: [] }
    })
  }

  setSession(key: string, sessionId: string | null): Promise<void> {
    return this.change(key, (c) => ({ ...c, sessionId }))
  }

  /** Ajoute l'élément, ou remplace celui qui a le même id. */
  appendOrReplace(key: string, item: ChatItem): Promise<void> {
    return this.change(key, (c) => {
      const items = [...c.items]
      const at = items.findIndex((i) => i.id === item.id)
      if (at >= 0) items[at] = item
      else items.push(item)
      return { ...c, items: items.slice(-MAX_ITEMS) }
    })
  }

  /** Empreintes des vignettes utilisées par les conversations (sauf `except`). */
  images(except?: string): Promise<Set<string>> {
    return this.serial(async () => {
      const data = await this.load()
      const out = new Set<string>()
      for (const [key, c] of Object.entries(data)) {
        if (key === except || !c || !Array.isArray(c.items)) continue
        for (const hash of imageHashes(c.items)) out.add(hash)
      }
      return out
    })
  }

  /** Oublie la conversation (nouvelle conversation, ou document sans titre au démarrage). */
  reset(key: string): Promise<void> {
    return this.change(key, () => null)
  }
}
