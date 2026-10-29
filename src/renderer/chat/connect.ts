import { findNode } from '../../core/tree'
import type { MaquetteDocument } from '../../core/types'
import { DEFAULT_CHAT_OPTIONS, type ChatApi, type ChatOptions, type ConversationSwitch, type OtherConversation } from '../../shared/chat'
import { ask } from '../dialog/dialogStore'
import { confirmLeave } from '../state/commands'
import { fileName, openDocument } from '../state/openDocument'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'
import { agentStore, CLAUDE } from '../agents/agentStore'
import { chatStore } from './chatStore'

/** API du chat, absente dans certains tests : tout le panneau devient alors inerte. */
export const chatApi = (): ChatApi | undefined => (globalThis as { maquette?: { chat?: ChatApi } }).maquette?.chat

/**
 * Branche le chat : la conversation suit le fichier ouvert (au démarrage puis à chaque changement de
 * chemin), les événements du principal remplissent la liste, une nouvelle sélection se rejoint au message.
 */
export function startChat(): () => void {
  const api = chatApi()
  if (!api) return () => {}
  // Seul le dernier historique demandé compte (fichiers ouverts coup sur coup).
  let seq = 0
  const load = (path: string | null) => {
    const n = ++seq
    api.open(path).then(
      (items) => {
        if (n === seq) chatStore.getState().setItems(items)
      },
      () => {
        if (n === seq) chatStore.getState().setItems([])
      },
    ).then(() => {
      if (n === seq) refreshConversations()
      return n === seq ? api.options() : null
    }).then(
      (options) => {
        if (options && n === seq) chatStore.getState().setOptions({ ...DEFAULT_CHAT_OPTIONS, ...options })
      },
      () => {
        if (n === seq) chatStore.getState().setOptions(DEFAULT_CHAT_OPTIONS)
      },
    )
  }
  load(docStore.getState().filePath)
  const offDoc = docStore.subscribe((s, prev) => {
    if (s.filePath !== prev.filePath) load(s.filePath)
  })
  const offSel = uiStore.subscribe((s, prev) => {
    if (s.selection !== prev.selection) chatStore.getState().setContextAttached(true)
  })
  const offEvents = api.onEvent((event) => {
    chatStore.getState().applyEvent(event)
    // Début et fin de tour : le titre (premier message) et l'ordre des conversations changent.
    if (event.type === 'busy') refreshConversations()
  })
  // Pendant une réponse, le curseur de Claude reste affiché (et « pense » entre deux outils).
  const offBusy = chatStore.subscribe((s, prev) => {
    if (s.busy !== prev.busy) agentStore.getState().setBusy(CLAUDE.id, s.busy)
  })
  return () => {
    seq++
    offDoc()
    offSel()
    offEvents()
    offBusy()
  }
}

/** Relit la liste des conversations (menu et titre du panneau). */
export function refreshConversations(): void {
  const api = chatApi()
  if (!api?.conversations) return
  const n = ++listSeq
  api.conversations().then(
    (list) => {
      if (n === listSeq) chatStore.getState().setConversations(list)
    },
    () => undefined,
  )
}
let listSeq = 0

/** Affiche la conversation ouverte par le principal (null : refusé, rien ne change). */
function show(result: ConversationSwitch): boolean {
  if (!result) return false
  const store = chatStore.getState()
  store.setItems(result.items)
  store.setOptions({ ...DEFAULT_CHAT_OPTIONS, ...result.options })
  refreshConversations()
  return true
}

/** Message affiché quand un changement de conversation est refusé pendant une réponse. */
export const BUSY_NOTICE = 'Claude is still replying: stop the reply (Stop) to switch conversations.'

/** Nouvelle conversation : l'ancienne reste dans la liste. */
export async function newConversation(): Promise<boolean> {
  return show((await chatApi()?.reset().catch(() => null)) ?? null)
}

/** Ouvre une autre conversation du fichier ; false si refusé (Claude répond encore). */
export async function openConversation(id: string): Promise<boolean> {
  return show((await chatApi()?.switchTo(id).catch(() => null)) ?? null)
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await chatApi()?.rename(id, title).catch(() => undefined)
  refreshConversations()
}

/** Supprime une conversation après confirmation (fenêtre de question de l'app). */
export async function removeConversation(id: string, title: string): Promise<boolean> {
  const answer = await ask({
    message: `Delete the conversation “${title}”?`,
    detail: 'Its messages and images will be erased.',
    buttons: [{ label: 'Cancel' }, { label: 'Delete', kind: 'danger' }],
    cancelIndex: 0,
    defaultIndex: 0,
  })
  if (answer !== 1) return false
  return show((await chatApi()?.remove(id).catch(() => null)) ?? null)
}

/** Ouvre le fichier d'une autre conversation (avec la question habituelle), puis cette conversation. */
export async function openOtherConversation(other: OtherConversation): Promise<boolean> {
  const api = chatApi()
  if (!api || other.missing || !(await confirmLeave())) return false
  const file = await api.openFile(other.path, other.id).catch(() => null)
  if (!file) {
    docStore.getState().showError(`${fileName(other.path)} could not be found.`)
    refreshConversations()
    return false
  }
  return openDocument(file)
}

/** Change des réglages de la conversation : affiché tout de suite, enregistré par le principal. */
export function changeOptions(patch: Partial<ChatOptions>): void {
  const store = chatStore.getState()
  store.setOptions({ ...store.options, ...patch })
  chatApi()?.setOptions(patch).then(
    (options) => chatStore.getState().setOptions({ ...DEFAULT_CHAT_OPTIONS, ...options }),
    () => undefined,
  )
}

const TYPE_LABEL: Record<string, string> = { frame: 'frame', text: 'text', shape: 'shape', image: 'image', icon: 'icon', vector: 'vector' }

/** Les images de la sélection (références d'inspiration collées sur le canevas). */
const imagesOf = (doc: MaquetteDocument, ids: string[]) =>
  ids.flatMap((id) => {
    const node = findNode(doc, id)?.node
    return node?.type === 'image' ? [node] : []
  })

/** Ce que la pastille affiche : le nom d'un élément seul, sinon le nombre (d'images, s'il y en a). */
export function selectionLabel(doc: MaquetteDocument, ids: string[]): string {
  if (ids.length === 1) {
    const node = findNode(doc, ids[0]!)?.node
    return node ? node.name || TYPE_LABEL[node.type] || node.type : '1 layer selected'
  }
  const images = imagesOf(doc, ids).length
  if (images === ids.length) return `${images} images`
  if (images > 0) return `${ids.length} layers, ${images} image${images > 1 ? 's' : ''}`
  return `${ids.length} layers selected`
}

/** Taille d'origine d'une image affichée (px), si elle est chargée. */
export type NaturalSize = (id: string) => { width: number; height: number } | null

const px = (s: number | { mode: string }) => (typeof s === 'number' ? Math.round(s) : s.mode)

/**
 * Contexte joint pour Claude : identifiants, types et noms de la sélection ; ses images sont
 * annoncées comme références à regarder avec l'outil capture (taille d'origine si connue).
 */
export function selectionContext(doc: MaquetteDocument, ids: string[], natural: NaturalSize = () => null): string {
  const parts = ids.map((id) => {
    const node = findNode(doc, id)?.node
    if (!node) return id
    const kind = node.type === 'shape' ? `shape ${node.shape}` : node.type
    return `${id} (${kind}, « ${node.name} »)`
  })
  if (!parts.length) return ''
  const lines = [`Sélection dans Maquette : ${parts.join(', ')}`]
  const images = imagesOf(doc, ids)
  if (images.length) {
    const listed = images.map((n) => {
      const size = natural(n.id)
      return `${n.id} (${n.name}, ${size ? `${size.width}×${size.height}` : `${px(n.width)}×${px(n.height)}`})`
    })
    const n = images.length
    const call = n === 1 ? `capture({ id: "${images[0]!.id}" })` : `capture({ ids: [${images.slice(0, 10).map((i) => `"${i.id}"`).join(', ')}] })`
    lines.push(`${n} image${n > 1 ? 's' : ''} de référence sélectionnée${n > 1 ? 's' : ''} : ${listed.join(', ')} — regarde-les avec ${call}.`)
  }
  return lines.join('\n')
}

/**
 * Envoie une demande à Claude depuis l'éditeur (ex. « corrige ces fautes ») : ouvre l'onglet Claude et
 * joint les éléments concernés comme contexte. Refusé (false) pendant une réponse en cours.
 */
export function askClaude(text: string, ids: string[]): boolean {
  const api = chatApi()
  if (!api || chatStore.getState().busy) return false
  chatStore.getState().setOpen(true)
  api.send({ text, context: selectionContext(docStore.getState().doc, ids), images: [] })
  return true
}
