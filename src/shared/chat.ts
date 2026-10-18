/** Chat avec Claude (Claude Code lancé par l'app) : ce qui circule entre le principal et la fenêtre. */

/**
 * Vignette d'une image du chat (jointe par l'utilisateur ou vue par Claude), enregistrée par le principal
 * dans userData/chat-images/<hash>.jpg et servie par chatImageUrl(hash).
 */
export interface ChatImageRef { hash: string; width: number; height: number }

export const CHAT_IMAGE_SCHEME = 'maquette-chat'
/** Empreinte d'une vignette : SHA-256 en hexadécimal. */
export const CHAT_IMAGE_HASH = /^[0-9a-f]{64}$/
export const chatImageUrl = (hash: string): string => `${CHAT_IMAGE_SCHEME}://img/${hash}.jpg`

export type ChatItem =
  /** images : nombre d'images jointes ; thumbs : leurs vignettes (absentes dans l'ancien historique, ou format illisible). */
  | { kind: 'user'; id: string; text: string; images: number; thumbs?: ChatImageRef[] }
  | { kind: 'assistant'; id: string; text: string }
  /**
   * input : ce que Claude a envoyé à l'outil, lisible ; output : texte du résultat ; images : images du résultat.
   * Champs absents dans l'ancien historique (la ligne ne se déplie alors pas). Textes tronqués à ~20 000 caractères.
   */
  | { kind: 'tool'; id: string; name: string; summary: string; status: 'running' | 'done' | 'error'; input?: string; output?: string; images?: ChatImageRef[] }
  | { kind: 'permission'; id: string; requestId: string; tool: string; summary: string; status: 'asking' | 'allowed' | 'denied' }
  | { kind: 'error'; id: string; text: string }

export type ChatEvent =
  /** Nouvel élément, ou remplacement de l'élément de même id. */
  | { type: 'item'; item: ChatItem }
  /** Texte qui s'ajoute à un élément assistant (créé s'il n'existe pas encore). */
  | { type: 'delta'; id: string; text: string }
  /** Claude travaille (true) ou attend un message (false). */
  | { type: 'busy'; busy: boolean }

export interface ChatImage { mediaType: string; data: string }
/** text : ce que l'utilisateur a tapé (affiché) ; context : ajouté devant pour Claude seulement (sélection). */
export interface ChatSend { text: string; context: string; images: ChatImage[] }
export type PermissionDecision = 'allow' | 'always' | 'deny'

/**
 * Réglages d'une conversation, mémorisés avec elle (chats.json) : taste = méthode taste-skill
 * (sinon méthode de Pen). Un changement relance claude (avec --resume) au message suivant.
 */
export interface ChatOptions { taste: boolean }
export const DEFAULT_CHAT_OPTIONS: ChatOptions = { taste: false }

/** Titre d'une conversation sans message ni titre choisi. */
export const NEW_CONVERSATION_TITLE = 'Nouvelle conversation'
/** Longueur du titre tiré du premier message. */
export const TITLE_LENGTH = 60

/** Titre tiré du premier message de l'utilisateur (null : aucun message). */
export function autoTitle(items: ChatItem[]): string | null {
  const first = items.find((i): i is Extract<ChatItem, { kind: 'user' }> => i.kind === 'user')
  if (!first) return null
  const text = first.text.replace(/\s+/g, ' ').trim()
  if (!text) return first.images > 1 ? 'Images jointes' : first.images === 1 ? 'Image jointe' : null
  return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : text
}

/** Conversation d'un fichier, telle que le menu du chat la montre. */
export interface ConversationSummary {
  id: string
  title: string
  /** Dates en millisecondes (Date.now()). */
  createdAt: number
  updatedAt: number
}

/** Conversation récente d'un autre fichier. */
export interface OtherConversation extends ConversationSummary {
  path: string
  /** Fichier introuvable sur le disque. */
  missing: boolean
}

export interface ConversationList {
  /** Conversation ouverte. */
  current: string | null
  /** Conversations du fichier ouvert, de la plus récente à la plus ancienne. */
  conversations: ConversationSummary[]
  /** Conversations récentes des autres fichiers. */
  others: OtherConversation[]
}

/** Résultat d'un changement de conversation : null si refusé (Claude répond encore). */
export type ConversationSwitch = { items: ChatItem[]; options: ChatOptions } | null

export interface ChatApi {
  /** Conversation du fichier (null = sans titre) : arrête l'ancienne, renvoie l'historique de celle-ci. */
  open(path: string | null): Promise<ChatItem[]>
  send(message: ChatSend): void
  stop(): void
  permission(requestId: string, decision: PermissionDecision): void
  /**
   * Nouvelle conversation pour le fichier courant : l'ancienne reste dans la liste, ses réglages passent
   * à la nouvelle. Refusée (null) pendant une réponse.
   */
  reset(): Promise<ConversationSwitch>
  /** Conversations du fichier ouvert et récentes des autres fichiers. */
  conversations(): Promise<ConversationList>
  /** Ouvre une autre conversation du fichier (la suite reprend sa session) ; null pendant une réponse. */
  switchTo(id: string): Promise<ConversationSwitch>
  /** Renomme une conversation du fichier ouvert (titre vide : début du premier message). */
  rename(id: string, title: string): Promise<void>
  /**
   * Supprime une conversation du fichier ouvert et ses vignettes ; renvoie la conversation ouverte ensuite.
   * null : refusé (conversation ouverte pendant une réponse).
   */
  remove(id: string): Promise<ConversationSwitch>
  /** Conversation à ouvrir avec ce fichier, au prochain open(path) (avant d'ouvrir le fichier). */
  prepare(path: string, id: string): Promise<void>
  /** Réglages de la conversation ouverte. */
  options(): Promise<ChatOptions>
  /** Change des réglages de la conversation ouverte ; renvoie les réglages à jour. */
  setOptions(patch: Partial<ChatOptions>): Promise<ChatOptions>
  onEvent(cb: (event: ChatEvent) => void): () => void
}
