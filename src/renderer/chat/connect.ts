import { findNode } from '../../core/tree'
import type { MaquetteDocument } from '../../core/types'
import { DEFAULT_CHAT_OPTIONS, type ChatApi, type ChatOptions } from '../../shared/chat'
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
    ).then(() => (n === seq ? api.options() : null)).then(
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
  const offEvents = api.onEvent((event) => chatStore.getState().applyEvent(event))
  return () => {
    seq++
    offDoc()
    offSel()
    offEvents()
  }
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

const TYPE_LABEL: Record<string, string> = { frame: 'cadre', text: 'texte', shape: 'forme', image: 'image', icon: 'icône' }

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
    return node ? node.name || TYPE_LABEL[node.type] || node.type : '1 élément sélectionné'
  }
  const images = imagesOf(doc, ids).length
  if (images === ids.length) return `${images} images`
  if (images > 0) return `${ids.length} éléments dont ${images} image${images > 1 ? 's' : ''}`
  return `${ids.length} éléments sélectionnés`
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
