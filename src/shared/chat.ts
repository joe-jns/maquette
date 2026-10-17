/** Chat avec Claude (Claude Code lancé par l'app) : ce qui circule entre le principal et la fenêtre. */
import type { ChatStyle } from './chatStyle'

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
 * (sinon méthode de Pen ; un changement relance claude avec --resume au message suivant) ;
 * style = style de Pen choisi dans la saisie, joint à chaque message (null : le prompt décide).
 */
export interface ChatOptions { taste: boolean; style: ChatStyle | null }
export const DEFAULT_CHAT_OPTIONS: ChatOptions = { taste: false, style: null }

export interface ChatApi {
  /** Conversation du fichier (null = sans titre) : arrête l'ancienne, renvoie l'historique de celle-ci. */
  open(path: string | null): Promise<ChatItem[]>
  send(message: ChatSend): void
  stop(): void
  permission(requestId: string, decision: PermissionDecision): void
  /** Nouvelle conversation pour le fichier courant (oublie l'ancienne, garde ses réglages). */
  reset(): Promise<void>
  /** Réglages de la conversation ouverte. */
  options(): Promise<ChatOptions>
  /** Change des réglages de la conversation ouverte ; renvoie les réglages à jour. */
  setOptions(patch: Partial<ChatOptions>): Promise<ChatOptions>
  onEvent(cb: (event: ChatEvent) => void): () => void
}
