import { createStore, useStore } from 'zustand'
import { findNode } from '../../core/tree'
import type { Node } from '../../core/types'
import type { TasteCheck, TasteInput } from '../../shared/ipc'
import type { DirectionOption, DirectionSheet } from '../../taste/direction'
import { PAGE_RULES } from '../../taste/rules'
import { docStore } from '../state/store'

/** Résultat d'un contrôle, attaché à l'état du cadre au moment du contrôle. */
export interface CheckRun {
  frameId: string
  /** Le cadre tel qu'il était : s'il change (nouvel objet), le résultat est périmé. */
  node: Node
  result: TasteCheck
}

interface TasteState {
  input: TasteInput
  options: DirectionOption[] | null
  sheet: (DirectionSheet & { direction?: { id: string; name: string; idea: string }; hero?: { name: string; blueprint: string } }) | null
  /** Tirage en cours (panneau Direction). */
  drawing: 'options' | 'direction' | null
  drawError: string | null
  /** Contrôle en cours (section du panneau Design). */
  checking: boolean
  checkError: string | null
  check: CheckRun | null
  /** Règles ignorées par l'utilisateur (en plus de celles sans objet sur une maquette fixe). */
  allow: string[]
  setInput(patch: Partial<TasteInput>): void
  drawOptions(): Promise<void>
  choose(direction: string): Promise<void>
  runCheck(frameId: string): Promise<void>
  toggleRule(id: string): void
  ignorePageRules(): void
}

/** Numéro du dernier contrôle demandé : la réponse d'un contrôle dépassé est ignorée. */
let checkSeq = 0

export const tasteStore = createStore<TasteState>()((set, get) => ({
  input: { sector: 'restaurant', brief: '', tone: undefined },
  options: null,
  sheet: null,
  drawing: null,
  drawError: null,
  checking: false,
  checkError: null,
  check: null,
  allow: [],
  setInput: (patch) => set({ input: { ...get().input, ...patch } }),
  async drawOptions() {
    if (get().drawing) return
    set({ drawing: 'options', drawError: null, options: null, sheet: null })
    try {
      const r = await window.maquette.taste.options(get().input)
      set(r.ok ? { options: r.value } : { drawError: r.message })
    } catch (e) {
      set({ drawError: (e as Error).message })
    } finally {
      set({ drawing: null })
    }
  },
  async choose(direction) {
    if (get().drawing) return
    set({ drawing: 'direction', drawError: null })
    try {
      const r = await window.maquette.taste.direction({ ...get().input, direction })
      set(r.ok ? { sheet: r.value } : { drawError: r.message })
    } catch (e) {
      set({ drawError: (e as Error).message })
    } finally {
      set({ drawing: null })
    }
  },
  async runCheck(frameId) {
    const doc = docStore.getState().doc
    const node = findNode(doc, frameId)?.node
    if (!node) return
    const seq = ++checkSeq
    set({ checking: true, checkError: null })
    let result: Awaited<ReturnType<typeof window.maquette.taste.check>> = null
    try {
      result = await window.maquette.taste.check(doc, frameId, get().allow)
    } catch {
      result = null
    }
    if (seq !== checkSeq) return
    if (result) set({ checking: false, check: { frameId, node, result } })
    else set({ checking: false, checkError: 'Contrôle impossible : cadre masqué, ou rendu trop long (polices encore en téléchargement ?). Réessayez.' })
  },
  toggleRule(id) {
    const allow = get().allow
    set({ allow: allow.includes(id) ? allow.filter((r) => r !== id) : [...allow, id] })
    // Le résultat affiché suit la liste : on revérifie le cadre déjà contrôlé.
    const run = get().check
    if (run) void get().runCheck(run.frameId)
  },
  ignorePageRules() {
    set({ allow: [...new Set([...get().allow, ...PAGE_RULES])] })
    const run = get().check
    if (run) void get().runCheck(run.frameId)
  },
}))

export const useTaste = <T,>(selector: (s: TasteState) => T): T => useStore(tasteStore, selector)

/** Le contrôle porte-t-il encore sur le cadre tel qu'il est ? */
export function isFresh(run: CheckRun | null): boolean {
  if (!run) return false
  return findNode(docStore.getState().doc, run.frameId)?.node === run.node
}
