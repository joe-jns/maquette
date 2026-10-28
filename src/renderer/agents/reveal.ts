import { findNode } from '../../core/tree'
import type { Node } from '../../core/types'
import { docStore } from '../state/store'
import { agentStore } from './agentStore'

/**
 * Apparition progressive de ce que Claude crée (comme Pen) : le document reçoit tout d'un coup, la fenêtre
 * dévoile les éléments un par un dans l'ordre de lecture (cadre, puis nav, puis titre…), le curseur de
 * l'agent passant de l'un à l'autre. Purement visuel : le document, les captures et les exports sont complets
 * dès le départ, et Claude n'attend pas la fin.
 */

/** Durée totale visée pour un lot, quel que soit le nombre d'éléments. */
const BATCH_MS = 2400
const MIN_STEP_MS = 35
const MAX_STEP_MS = 160
/** Au-delà, les éléments sont dévoilés par petits groupes (même durée totale). */
const MAX_STEPS = 60
const FADE_MS = 220

const pending = new Set<string>()
const fading = new Set<string>()
let queue: { ids: string[]; agentId: string }[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let sheet: HTMLStyleElement | null = null

const esc = (id: string) => id.replace(/["\\]/g, '\\$&')

/** Feuille de style de la fenêtre : éléments encore cachés, et fondu de ceux qui viennent d'apparaître. */
function render(): void {
  if (!sheet) {
    sheet = document.createElement('style')
    sheet.id = 'agent-reveal'
    document.head.appendChild(sheet)
  }
  const hidden = [...pending].map((id) => `[data-node-id="${esc(id)}"]`)
  const shown = [...fading].map((id) => `[data-node-id="${esc(id)}"]`)
  sheet.textContent =
    (hidden.length ? `${hidden.join(',')}{opacity:0!important;}` : '') +
    (shown.length ? `${shown.join(',')}{animation:agent-reveal ${FADE_MS}ms ease-out;}` : '')
}

/** L'élément et ses descendants, dans l'ordre de lecture (parent d'abord). */
function subtree(node: Node, out: string[]): void {
  out.push(node.id)
  if ('children' in node && Array.isArray(node.children)) for (const c of node.children as Node[]) subtree(c, out)
}

function step(): void {
  timer = null
  const batch = queue[0]
  if (!batch) return
  const count = Math.max(1, Math.ceil(batch.ids.length / MAX_STEPS))
  const group = batch.ids.splice(0, count)
  for (const id of group) {
    pending.delete(id)
    fading.add(id)
  }
  render()
  agentStore.getState().activity(batch.agentId, group)
  setTimeout(() => {
    for (const id of group) fading.delete(id)
    render()
  }, FADE_MS + 20)
  if (!batch.ids.length) queue.shift()
  const next = queue[0]
  if (next) timer = setTimeout(step, interval(next.ids.length))
}

const interval = (n: number) => Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, BATCH_MS / Math.min(n, MAX_STEPS)))

/**
 * Cache tout de suite (avant que la fenêtre ne peigne) les éléments créés `ids` et leurs enfants,
 * puis les dévoile un à un. À appeler juste après le dispatch, dans la même tâche.
 */
export function revealCreated(ids: string[], agentId: string): void {
  if (!ids.length || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    agentStore.getState().activity(agentId, ids)
    return
  }
  const doc = docStore.getState().doc
  const order: string[] = []
  for (const id of ids) {
    const found = findNode(doc, id)?.node
    if (found) subtree(found, order)
  }
  const fresh = [...new Set(order)].filter((id) => !pending.has(id))
  if (!fresh.length) return
  for (const id of fresh) pending.add(id)
  render()
  queue.push({ ids: fresh, agentId })
  if (!timer) timer = setTimeout(step, 0)
}

/** Tout montrer d'un coup (fichier rechargé, annulation pendant l'apparition…). */
export function revealAll(): void {
  if (timer) clearTimeout(timer)
  timer = null
  queue = []
  pending.clear()
  fading.clear()
  render()
}
