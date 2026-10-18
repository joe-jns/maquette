import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { autoTitle, DEFAULT_CHAT_OPTIONS, NEW_CONVERSATION_TITLE, type ChatItem, type ChatOptions, type ConversationSummary } from '../../shared/chat'
import { imageHashes } from './chatImages'

/** Clé des conversations d'un document sans titre. */
export const UNTITLED = 'sans-titre'
/** Éléments gardés par conversation (les plus anciens partent). */
export const MAX_ITEMS = 200
/** Conversations gardées par fichier (les plus anciennes partent, avec leurs vignettes). */
export const MAX_CONVERSATIONS = 50
/** Conversations des autres fichiers proposées dans le menu. */
export const MAX_OTHERS = 10
/** Longueur maximale d'un titre choisi. */
export const MAX_TITLE = 120

export interface Conversation {
  id: string
  /** Titre choisi par l'utilisateur ; null : début du premier message. */
  title: string | null
  createdAt: number
  /** Dernière activité (dernier élément ajouté). */
  updatedAt: number
  sessionId: string | null
  items: ChatItem[]
  options?: Partial<ChatOptions>
}

/** Conversations d'un fichier ; `current` : celle qui s'ouvre avec lui. */
interface FileChats { current: string | null; conversations: Conversation[] }
type Data = Record<string, FileChats>

/** Conversation d'un autre fichier (sans l'état « introuvable », vérifié par l'appelant). */
export interface OtherSummary extends ConversationSummary { path: string }

/** Réglages lus dans le fichier : seules les valeurs du bon type comptent, le reste prend la valeur par défaut. */
export function cleanOptions(raw: unknown): ChatOptions {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return { taste: typeof o.taste === 'boolean' ? o.taste : DEFAULT_CHAT_OPTIONS.taste }
}

export const chatKey = (path: string | null): string => path ?? UNTITLED

export const conversationTitle = (c: Conversation): string => c.title || autoTitle(c.items) || NEW_CONVERSATION_TITLE

const summary = (c: Conversation): ConversationSummary => ({ id: c.id, title: conversationTitle(c), createdAt: c.createdAt, updatedAt: c.updatedAt })

/** Conversation pas encore commencée : ni message, ni session. */
const isBlank = (c: Conversation) => c.items.length === 0 && !c.sessionId

/** De la plus récente à la plus ancienne ; à égalité, la dernière créée d'abord. */
function byRecent<T extends Conversation>(list: T[]): T[] {
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.updatedAt - a.c.updatedAt || b.c.createdAt - a.c.createdAt || b.i - a.i)
    .map(({ c }) => c)
}

/** Date d'un élément de l'utilisateur, lue dans son id (`u-<base36>-n`) ; null sinon. */
function stampOf(item: ChatItem): number | null {
  const m = item.kind === 'user' ? /^u-([0-9a-z]+)-\d+$/.exec(item.id) : null
  const t = m ? parseInt(m[1]!, 36) : NaN
  return Number.isFinite(t) && t > 0 ? t : null
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

function cleanConversation(raw: Record<string, unknown>, now: number): Conversation {
  const items = Array.isArray(raw.items) ? (raw.items as ChatItem[]) : []
  const stamps = items.map(stampOf).filter((t): t is number => t !== null)
  const createdAt = num(raw.createdAt, stamps.length ? Math.min(...stamps) : now)
  const conv: Conversation = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : randomUUID(),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, MAX_TITLE) : null,
    createdAt,
    updatedAt: num(raw.updatedAt, stamps.length ? Math.max(...stamps) : createdAt),
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : null,
    items,
  }
  if (isObject(raw.options)) conv.options = raw.options as Partial<ChatOptions>
  return conv
}

/**
 * Données lues dans chats.json. L'ancien format (une conversation par fichier : { sessionId, items, options })
 * devient la première conversation de ce fichier, sans perte.
 */
function cleanData(parsed: unknown, now: number): Data {
  const data: Data = {}
  if (!isObject(parsed)) return data
  for (const [key, value] of Object.entries(parsed)) {
    if (!isObject(value)) continue
    if (Array.isArray(value.conversations)) {
      const conversations = value.conversations.filter(isObject).map((c) => cleanConversation(c, now))
      const ids = new Set<string>()
      const unique = conversations.filter((c) => !ids.has(c.id) && ids.add(c.id))
      const current = typeof value.current === 'string' && ids.has(value.current) ? value.current : null
      if (unique.length) data[key] = { current, conversations: unique }
    } else {
      const conv = cleanConversation({ sessionId: value.sessionId, items: value.items, options: value.options }, now)
      if (!isBlank(conv) || conv.options) data[key] = { current: conv.id, conversations: [conv] }
    }
  }
  return data
}

const copy = (c: Conversation): Conversation => ({ ...c, items: [...c.items] })

/**
 * Conversations enregistrées dans `chats.json` : plusieurs par fichier. Les écritures passent une à une
 * et remplacent le fichier d'un coup (fichier temporaire puis renommage) : jamais de JSON coupé en deux.
 * Une conversation pas commencée vit en mémoire mais n'est pas écrite (sauf ses réglages, si elle est ouverte).
 */
export class ChatStore {
  private data: Data | null = null
  private chain: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
  ) {}

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work)
    this.chain = run.catch(() => undefined)
    return run
  }

  private async load(): Promise<Data> {
    if (this.data) return this.data
    try {
      this.data = cleanData(JSON.parse(await readFile(this.file, 'utf8')), this.now())
    } catch {
      // Absent ou abîmé : on repart d'un historique vide.
      this.data = {}
    }
    return this.data
  }

  private async save(): Promise<void> {
    const out: Data = {}
    for (const [key, file] of Object.entries(this.data ?? {})) {
      // Une conversation pas commencée n'est gardée que si elle est ouverte et a des réglages.
      const conversations = file.conversations.filter((c) => !isBlank(c) || (c.id === file.current && c.options))
      if (conversations.length) out[key] = { current: file.current, conversations }
    }
    const tmp = `${this.file}.tmp`
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(tmp, JSON.stringify(out), 'utf8')
    await rename(tmp, this.file)
  }

  private fresh(options?: Partial<ChatOptions>): Conversation {
    const t = this.now()
    const conv: Conversation = { id: randomUUID(), title: null, createdAt: t, updatedAt: t, sessionId: null, items: [] }
    if (options) conv.options = options
    return conv
  }

  /** Conversation ouverte avec le fichier : la dernière choisie, sinon la plus récente, sinon une nouvelle. */
  private currentOf(data: Data, key: string): Conversation {
    const file = (data[key] ??= { current: null, conversations: [] })
    let conv = file.conversations.find((c) => c.id === file.current) ?? byRecent(file.conversations)[0]
    if (!conv) {
      conv = this.fresh()
      file.conversations.push(conv)
    }
    file.current = conv.id
    return conv
  }

  /** Retire les conversations vides du fichier, sauf `keep`. */
  private dropBlank(file: FileChats, keep: string): void {
    file.conversations = file.conversations.filter((c) => c.id === keep || !isBlank(c))
  }

  /** Modifie une conversation existante (supprimée entre-temps : rien). */
  private change(key: string, id: string, edit: (c: Conversation) => void): Promise<void> {
    return this.serial(async () => {
      const conv = (await this.load())[key]?.conversations.find((c) => c.id === id)
      if (!conv) return
      edit(conv)
      await this.save()
    })
  }

  /** Conversation qui s'ouvre avec le fichier (créée vide s'il n'en a pas). */
  open(key: string): Promise<Conversation> {
    return this.serial(async () => copy(this.currentOf(await this.load(), key)))
  }

  get(key: string, id: string): Promise<Conversation | null> {
    return this.serial(async () => {
      const conv = (await this.load())[key]?.conversations.find((c) => c.id === id)
      return conv ? copy(conv) : null
    })
  }

  /** Conversations du fichier, de la plus récente à la plus ancienne ; une vide n'y est que si elle est ouverte. */
  list(key: string): Promise<{ current: string | null; conversations: ConversationSummary[] }> {
    return this.serial(async () => {
      const file = (await this.load())[key]
      if (!file) return { current: null, conversations: [] }
      const shown = file.conversations.filter((c) => c.id === file.current || !isBlank(c))
      return { current: file.current, conversations: byRecent(shown).map(summary) }
    })
  }

  /** Conversations récentes des autres fichiers enregistrés (pas les documents sans titre). */
  others(key: string, limit = MAX_OTHERS): Promise<OtherSummary[]> {
    return this.serial(async () => {
      const all: (Conversation & { path: string })[] = []
      for (const [path, file] of Object.entries(await this.load())) {
        if (path === key || path === UNTITLED) continue
        for (const c of file.conversations) if (c.items.length) all.push({ ...c, path })
      }
      return byRecent(all).slice(0, limit).map((c) => ({ ...summary(c), path: c.path }))
    })
  }

  /** Choisit la conversation qui s'ouvre avec le fichier ; null si elle n'existe pas. */
  select(key: string, id: string): Promise<Conversation | null> {
    return this.serial(async () => {
      const file = (await this.load())[key]
      const conv = file?.conversations.find((c) => c.id === id)
      if (!file || !conv) return null
      file.current = id
      this.dropBlank(file, id)
      await this.save()
      return copy(conv)
    })
  }

  /**
   * Nouvelle conversation, ouverte avec le fichier ; les réglages de la conversation ouverte la suivent.
   * La conversation ouverte déjà vide sert telle quelle. Au-delà de MAX_CONVERSATIONS, les plus anciennes
   * partent : `removed` donne les vignettes qu'elles utilisaient.
   */
  create(key: string): Promise<{ conversation: Conversation; removed: string[] }> {
    return this.serial(async () => {
      const data = await this.load()
      const current = this.currentOf(data, key)
      const file = data[key]!
      if (isBlank(current)) return { conversation: copy(current), removed: [] }
      const conv = this.fresh(current.options ? cleanOptions(current.options) : undefined)
      file.conversations.push(conv)
      file.current = conv.id
      this.dropBlank(file, conv.id)
      const removed: string[] = []
      const extra = file.conversations.length - MAX_CONVERSATIONS
      if (extra > 0) {
        const old = new Set(byRecent(file.conversations.filter((c) => c.id !== conv.id)).slice(-extra).map((c) => c.id))
        for (const c of file.conversations) if (old.has(c.id)) removed.push(...imageHashes(c.items))
        file.conversations = file.conversations.filter((c) => !old.has(c.id))
      }
      await this.save()
      return { conversation: copy(conv), removed }
    })
  }

  /** Titre choisi ; vide : retour au début du premier message. */
  rename(key: string, id: string, title: string): Promise<void> {
    const clean = title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
    return this.change(key, id, (c) => {
      c.title = clean || null
    })
  }

  /** Supprime une conversation ; renvoie les vignettes qu'elle utilisait. */
  remove(key: string, id: string): Promise<string[]> {
    return this.serial(async () => {
      const data = await this.load()
      const file = data[key]
      const conv = file?.conversations.find((c) => c.id === id)
      if (!file || !conv) return []
      file.conversations = file.conversations.filter((c) => c.id !== id)
      if (file.current === id) file.current = null
      if (!file.conversations.length) delete data[key]
      await this.save()
      return imageHashes(conv.items)
    })
  }

  /** Oublie toutes les conversations du fichier (document sans titre au démarrage). */
  forget(key: string): Promise<void> {
    return this.serial(async () => {
      const data = await this.load()
      if (!data[key]) return
      delete data[key]
      await this.save()
    })
  }

  setSession(key: string, id: string, sessionId: string | null): Promise<void> {
    return this.change(key, id, (c) => {
      c.sessionId = sessionId
    })
  }

  /** Ajoute l'élément, ou remplace celui qui a le même id ; la conversation devient la plus récente. */
  appendOrReplace(key: string, id: string, item: ChatItem): Promise<void> {
    return this.change(key, id, (c) => {
      const items = [...c.items]
      const at = items.findIndex((i) => i.id === item.id)
      if (at >= 0) items[at] = item
      else items.push(item)
      c.items = items.slice(-MAX_ITEMS)
      c.updatedAt = Math.max(c.updatedAt, this.now())
    })
  }

  /** Empreintes des vignettes utilisées par toutes les conversations (sauf `except`). */
  images(except?: { key: string; id: string }): Promise<Set<string>> {
    return this.serial(async () => {
      const out = new Set<string>()
      for (const [key, file] of Object.entries(await this.load())) {
        for (const c of file.conversations) {
          if (except && key === except.key && c.id === except.id) continue
          for (const hash of imageHashes(c.items)) out.add(hash)
        }
      }
      return out
    })
  }

  /** Réglages de la conversation (valeurs par défaut si elle n'en a pas). */
  options(key: string, id: string): Promise<ChatOptions> {
    return this.serial(async () => cleanOptions((await this.load())[key]?.conversations.find((c) => c.id === id)?.options))
  }

  /** Change des réglages ; renvoie les réglages à jour. */
  async setOptions(key: string, id: string, patch: Partial<ChatOptions>): Promise<ChatOptions> {
    let next = cleanOptions({ ...DEFAULT_CHAT_OPTIONS, ...patch })
    await this.change(key, id, (c) => {
      next = cleanOptions({ ...cleanOptions(c.options), ...patch })
      c.options = next
    })
    return next
  }
}
