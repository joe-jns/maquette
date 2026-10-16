import { createStore, useStore } from 'zustand'
import { History } from '../../core/history'
import { applyOps, type ApplyResult, type Measure, type Op } from '../../core/ops'
import type { MaquetteDocument } from '../../core/types'
import { newDocument } from '../../core/defaults'

export interface DocState {
  doc: MaquetteDocument
  filePath: string | null
  dirty: boolean
  pageId: string
  notice: string | null
  canUndo: boolean
  canRedo: boolean
  load(doc: MaquetteDocument, path: string | null): void
  showError(message: string): void
  dispatch(ops: Op[], label: string): ApplyResult
  undo(): void
  redo(): void
  markSaved(path: string): void
  setMeasure(fn: Measure): void
}

const history = new History()
let measure: Measure | undefined

const initial = newDocument()

export const docStore = createStore<DocState>()((set, get) => ({
  doc: initial,
  filePath: null,
  dirty: false,
  pageId: initial.pages[0]!.id,
  notice: null,
  canUndo: false,
  canRedo: false,

  load(doc, path) {
    history.clear()
    set({ doc, filePath: path, dirty: false, pageId: doc.pages[0]!.id, notice: null, canUndo: false, canRedo: false })
  },

  showError(message) {
    set({ notice: message })
  },

  dispatch(ops, label) {
    const result = applyOps(get().doc, ops, { measure })
    if (result.ok) {
      history.push({ label, patches: result.patches, inversePatches: result.inversePatches })
      set({ doc: result.doc, dirty: true, canUndo: history.canUndo(), canRedo: history.canRedo() })
    }
    return result
  },

  undo() {
    const r = history.undo(get().doc)
    if (r) set({ doc: r.doc, dirty: true, canUndo: history.canUndo(), canRedo: history.canRedo() })
  },

  redo() {
    const r = history.redo(get().doc)
    if (r) set({ doc: r.doc, dirty: true, canUndo: history.canUndo(), canRedo: history.canRedo() })
  },

  markSaved(path) {
    set({ filePath: path, dirty: false })
  },

  setMeasure(fn) {
    measure = fn
  },
}))

export function useDoc<T>(selector: (s: DocState) => T): T {
  return useStore(docStore, selector)
}
