import { findNode } from '../../core/tree'
import type { MaquetteDocument } from '../../core/types'
import type { ChatApi } from '../../shared/chat'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'
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
    )
  }
  load(docStore.getState().filePath)
  const offDoc = docStore.subscribe((s, prev) => {
    if (s.filePath !== prev.filePath) load(s.filePath)
  })
  const offSel = uiStore.subscribe((s, prev) => {
    if (s.selection !== prev.selection) chatStore.getState().setContextAttached(true)
  })
  const offEvents = api.onEvent((event) => chatStore.getState().applyEvent(event))
  return () => {
    seq++
    offDoc()
    offSel()
    offEvents()
  }
}

const TYPE_LABEL: Record<string, string> = { frame: 'cadre', text: 'texte', shape: 'forme', image: 'image', icon: 'icône' }

/** Ce que la pastille affiche : le nom d'un élément seul, sinon le nombre. */
export function selectionLabel(doc: MaquetteDocument, ids: string[]): string {
  if (ids.length === 1) {
    const node = findNode(doc, ids[0]!)?.node
    return node ? node.name || TYPE_LABEL[node.type] || node.type : '1 élément sélectionné'
  }
  return `${ids.length} éléments sélectionnés`
}

/** Contexte joint pour Claude : identifiants, types et noms de la sélection. */
export function selectionContext(doc: MaquetteDocument, ids: string[]): string {
  const parts = ids.map((id) => {
    const node = findNode(doc, id)?.node
    if (!node) return id
    const kind = node.type === 'shape' ? `shape ${node.shape}` : node.type
    return `${id} (${kind}, « ${node.name} »)`
  })
  return parts.length ? `Sélection dans Maquette : ${parts.join(', ')}` : ''
}
