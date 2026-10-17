import { createStore, useStore } from 'zustand'
import type { DialogRequest } from '../../shared/ipc'

/** Une question en attente de réponse. */
export interface PendingDialog {
  id: number
  request: DialogRequest
  resolve: (index: number) => void
}

interface DialogState {
  /** Questions dans l'ordre d'arrivée : seule la première est affichée. */
  queue: PendingDialog[]
  ask(request: DialogRequest): Promise<number>
  /** Répond à une question ; un indice hors des boutons vaut « annuler ». */
  answer(id: number, index: number): void
}

let nextId = 1

/** Indice valable pour cette question, sinon celui d'« annuler ». */
export const validIndex = (request: DialogRequest, index: number): number =>
  Number.isInteger(index) && index >= 0 && index < request.buttons.length ? index : request.cancelIndex

export const dialogStore = createStore<DialogState>()((set, get) => ({
  queue: [],
  ask: (request) =>
    new Promise<number>((resolve) => {
      set((s) => ({ queue: [...s.queue, { id: nextId++, request, resolve }] }))
    }),
  answer: (id, index) => {
    const pending = get().queue.find((d) => d.id === id)
    if (!pending) return
    set((s) => ({ queue: s.queue.filter((d) => d.id !== id) }))
    pending.resolve(validIndex(pending.request, index))
  },
}))

export function useDialog<T>(selector: (s: DialogState) => T): T {
  return useStore(dialogStore, selector)
}

/** Pose une question dans la fenêtre ; renvoie l'indice du bouton choisi. */
export const ask = (request: DialogRequest): Promise<number> => dialogStore.getState().ask(request)
