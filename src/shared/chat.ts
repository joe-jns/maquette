/** Chat avec Claude (Claude Code lancé par l'app) : ce qui circule entre le principal et la fenêtre. */

export type ChatItem =
  | { kind: 'user'; id: string; text: string; images: number }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; summary: string; status: 'running' | 'done' | 'error' }
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

export interface ChatApi {
  /** Conversation du fichier (null = sans titre) : arrête l'ancienne, renvoie l'historique de celle-ci. */
  open(path: string | null): Promise<ChatItem[]>
  send(message: ChatSend): void
  stop(): void
  permission(requestId: string, decision: PermissionDecision): void
  /** Nouvelle conversation pour le fichier courant (oublie l'ancienne). */
  reset(): Promise<void>
  onEvent(cb: (event: ChatEvent) => void): () => void
}
