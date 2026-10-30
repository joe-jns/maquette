import { createStore, useStore } from 'zustand'
import { DEFAULT_CHAT_OPTIONS, type ChatEvent, type ChatImage, type ChatImageRef, type ChatItem, type ChatOptions, type ConversationList } from '../../shared/chat'

/** Image collée ou glissée, en attente d'envoi ; `url` sert à la vignette. */
export interface PendingImage extends ChatImage {
  id: string
  url: string
}

export const MAX_IMAGES = 5
const OPEN_KEY = 'maquette.chat.open'

interface ChatState {
  open: boolean
  items: ChatItem[]
  /** Claude travaille : le bouton Envoyer devient Stop. */
  busy: boolean
  /** Tour en cours : la demande de l'utilisateur à laquelle Claude répond (null hors réponse). */
  turn: { id: string; text: string } | null
  /** Tours de cette session dont la réponse a modifié le document (bouton « Undo » sous la réponse). */
  edited: string[]
  draft: string
  images: PendingImage[]
  /** La sélection part avec le prochain message (remis à vrai à chaque nouvelle sélection). */
  contextAttached: boolean
  /** Incrémenté pour demander le focus dans la saisie. */
  focusRequest: number
  /** Image montrée en grand par-dessus l'app (null : aucune). */
  preview: ChatImageRef | null
  /** Réglages de la conversation ouverte (interrupteur taste-skill…). */
  options: ChatOptions
  /** Conversations du fichier ouvert et des autres fichiers (null : pas encore lues). */
  conversations: ConversationList | null
  setConversations(conversations: ConversationList | null): void
  setOptions(options: ChatOptions): void
  setOpen(open: boolean): void
  toggle(): void
  setItems(items: ChatItem[]): void
  /** La réponse à cette demande vient de modifier le document. */
  markEdited(turnId: string): void
  applyEvent(event: ChatEvent): void
  setDraft(draft: string): void
  /** Ajoute une image ; false si la limite est atteinte. */
  addImage(image: ChatImage): boolean
  removeImage(id: string): void
  setContextAttached(attached: boolean): void
  /** Après l'envoi : brouillon et images vidés. */
  clearComposer(): void
  setPreview(preview: ChatImageRef | null): void
}

function readOpen(): boolean {
  try {
    return globalThis.localStorage?.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeOpen(open: boolean): void {
  try {
    globalThis.localStorage?.setItem(OPEN_KEY, open ? '1' : '0')
  } catch {
    // Stockage indisponible : l'état ne sera simplement pas retenu.
  }
}

let imageSeq = 0

export const chatStore = createStore<ChatState>()((set, get) => ({
  open: readOpen(),
  items: [],
  busy: false,
  turn: null,
  edited: [],
  draft: '',
  images: [],
  contextAttached: true,
  focusRequest: 0,
  preview: null,
  options: DEFAULT_CHAT_OPTIONS,
  conversations: null,
  setConversations: (conversations) => set({ conversations }),
  setOptions: (options) => set({ options }),
  setOpen(open) {
    writeOpen(open)
    set(open ? { open, focusRequest: get().focusRequest + 1 } : { open, preview: null })
  },
  toggle() {
    get().setOpen(!get().open)
  },
  setItems: (items) => set({ items, busy: false, turn: null, preview: null }),
  markEdited: (turnId) => {
    if (!get().edited.includes(turnId)) set({ edited: [...get().edited, turnId] })
  },
  applyEvent(event) {
    const items = get().items
    switch (event.type) {
      case 'item': {
        const i = items.findIndex((it) => it.id === event.item.id)
        set({ items: i < 0 ? [...items, event.item] : items.map((it, k) => (k === i ? event.item : it)) })
        return
      }
      case 'delta': {
        const i = items.findIndex((it) => it.id === event.id)
        const current = items[i]
        if (!current) {
          set({ items: [...items, { kind: 'assistant', id: event.id, text: event.text }] })
          return
        }
        // Un delta ne s'applique qu'au texte d'un message de Claude.
        if (current.kind !== 'assistant') return
        set({ items: items.map((it, k) => (k === i ? { ...current, text: current.text + event.text } : it)) })
        return
      }
      case 'busy': {
        // Le principal envoie la demande puis « busy » : le tour est celui de la dernière demande.
        const last = event.busy ? items.findLast((it) => it.kind === 'user') : undefined
        set({ busy: event.busy, turn: last ? { id: last.id, text: last.text } : null })
        return
      }
    }
  },
  setDraft: (draft) => set({ draft }),
  addImage(image) {
    const images = get().images
    if (images.length >= MAX_IMAGES) return false
    const url = `data:${image.mediaType};base64,${image.data}`
    set({ images: [...images, { ...image, id: `img${++imageSeq}`, url }] })
    return true
  },
  removeImage: (id) => set({ images: get().images.filter((img) => img.id !== id) }),
  setContextAttached: (contextAttached) => set({ contextAttached }),
  clearComposer: () => set({ draft: '', images: [] }),
  setPreview: (preview) => set({ preview }),
}))

export const useChat = <T,>(selector: (s: ChatState) => T): T => useStore(chatStore, selector)
