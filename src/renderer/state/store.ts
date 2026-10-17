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
  /** Un geste (glisser, redimensionnement…) est en cours : `doc` montre son aperçu. */
  inGesture: boolean
  load(doc: MaquetteDocument, path: string | null): void
  showError(message: string): void
  dispatch(ops: Op[], label: string): ApplyResult
  undo(): void
  redo(): void
  markSaved(path: string): void
  setMeasure(fn: Measure): void
  /** Page affichée (sans historique : ce n'est pas une modification du document). */
  setPage(id: string): void
  /** Mémorise le document courant comme base du geste. */
  beginGesture(): void
  /** Applique `ops` à la base (pas de cumul) et l'affiche, sans toucher l'historique. Refusé : l'affichage garde le dernier aperçu valide. */
  previewGesture(ops: Op[]): ApplyResult
  /** Une seule entrée d'historique, de la base au dernier aperçu valide ; rien si aucun aperçu valide. */
  commitGesture(label: string): void
  /** Revient à la base, sans historique. */
  cancelGesture(): void
}

type Applied = Extract<ApplyResult, { ok: true }>

/** Geste en cours : base, et dernier aperçu valide (ses patchs vont de la base à l'aperçu). */
interface Gesture { base: MaquetteDocument; last: Applied | null }

/** Libellé d'un geste validé d'office (undo, dispatch… arrivés en plein geste). */
const IMPLICIT_LABEL = 'Modification'

const history = new History()

/** La page affichée, ou la première si elle n'existe plus (page annulée ou supprimée). */
const livePage = (doc: MaquetteDocument, pageId: string) => (doc.pages.some((p) => p.id === pageId) ? pageId : doc.pages[0]!.id)
let measure: Measure | undefined
let gesture: Gesture | null = null

const initial = newDocument()

export const docStore = createStore<DocState>()((set, get) => ({
  doc: initial,
  filePath: null,
  dirty: false,
  pageId: initial.pages[0]!.id,
  notice: null,
  canUndo: false,
  canRedo: false,
  inGesture: false,

  load(doc, path) {
    history.clear()
    gesture = null
    set({ doc, filePath: path, dirty: false, pageId: doc.pages[0]!.id, notice: null, canUndo: false, canRedo: false, inGesture: false })
  },

  showError(message) {
    set({ notice: message })
  },

  dispatch(ops, label) {
    if (gesture) get().commitGesture(IMPLICIT_LABEL)
    const result = applyOps(get().doc, ops, { measure })
    if (result.ok) {
      history.push({ label, patches: result.patches, inversePatches: result.inversePatches })
      set({ doc: result.doc, dirty: true, canUndo: history.canUndo(), canRedo: history.canRedo() })
    }
    return result
  },

  undo() {
    if (gesture) get().commitGesture(IMPLICIT_LABEL)
    const r = history.undo(get().doc)
    if (r) set({ doc: r.doc, pageId: livePage(r.doc, get().pageId), dirty: true, canUndo: history.canUndo(), canRedo: history.canRedo() })
  },

  redo() {
    if (gesture) get().commitGesture(IMPLICIT_LABEL)
    const r = history.redo(get().doc)
    if (r) set({ doc: r.doc, pageId: livePage(r.doc, get().pageId), dirty: true, canUndo: history.canUndo(), canRedo: history.canRedo() })
  },

  markSaved(path) {
    set({ filePath: path, dirty: false })
  },

  setPage(id) {
    if (get().doc.pages.some((p) => p.id === id)) set({ pageId: id })
  },

  setMeasure(fn) {
    measure = fn
  },

  beginGesture() {
    // Un geste précédent jamais terminé est validé plutôt que perdu.
    if (gesture) get().commitGesture(IMPLICIT_LABEL)
    gesture = { base: get().doc, last: null }
    set({ inGesture: true })
  },

  previewGesture(ops) {
    if (!gesture) get().beginGesture()
    const g = gesture!
    const result = applyOps(g.base, ops, { measure })
    if (result.ok) {
      g.last = result
      set({ doc: result.doc })
    }
    return result
  },

  commitGesture(label) {
    const g = gesture
    if (!g) return
    gesture = null
    if (!g.last) {
      set({ inGesture: false })
      return
    }
    history.push({ label, patches: g.last.patches, inversePatches: g.last.inversePatches })
    set({ doc: g.last.doc, dirty: true, inGesture: false, canUndo: history.canUndo(), canRedo: history.canRedo() })
  },

  cancelGesture() {
    const g = gesture
    if (!g) return
    gesture = null
    set({ doc: g.base, inGesture: false })
  },
}))

export function useDoc<T>(selector: (s: DocState) => T): T {
  return useStore(docStore, selector)
}
