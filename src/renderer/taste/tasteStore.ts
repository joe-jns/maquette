import { createStore, useStore } from 'zustand'
import { findNode } from '../../core/tree'
import type { Node } from '../../core/types'
import type { TasteCheck, TasteInput } from '../../shared/ipc'
import type { DirectionOption, DirectionSheet } from '../../taste/direction'
import { PAGE_RULES } from '../../taste/rules'
import { docStore } from '../state/store'

export type PanelTab = 'design' | 'direction'

/** Résultat d'un contrôle, attaché à l'état du cadre au moment du contrôle. */
export interface CheckRun {
  frameId: string
  /** Le cadre tel qu'il était : s'il change (nouvel objet), le résultat est périmé. */
  node: Node
  result: TasteCheck
}

interface TasteState {
  tab: PanelTab
  input: TasteInput
  options: DirectionOption[] | null
  sheet: (DirectionSheet & { direction?: { id: string; name: string; idea: string }; hero?: { name: string; blueprint: string } }) | null
  busy: 'options' | 'direction' | 'check' | null
  error: string | null
  check: CheckRun | null
  /** Règles ignorées par l'utilisateur (en plus de celles sans objet sur une maquette fixe). */
  allow: string[]
  setTab(tab: PanelTab): void
  setInput(patch: Partial<TasteInput>): void
  drawOptions(): Promise<void>
  choose(direction: string): Promise<void>
  runCheck(frameId: string): Promise<void>
  toggleRule(id: string): void
  ignorePageRules(): void
  clearCheck(): void
}

export const tasteStore = createStore<TasteState>()((set, get) => ({
  tab: 'design',
  input: { sector: 'restaurant', brief: '', tone: undefined },
  options: null,
  sheet: null,
  busy: null,
  error: null,
  check: null,
  allow: [],
  setTab: (tab) => set({ tab }),
  setInput: (patch) => set({ input: { ...get().input, ...patch } }),
  async drawOptions() {
    set({ busy: 'options', error: null, options: null, sheet: null })
    const r = await window.maquette.taste.options(get().input)
    set(r.ok ? { busy: null, options: r.value } : { busy: null, error: r.message })
  },
  async choose(direction) {
    set({ busy: 'direction', error: null })
    const r = await window.maquette.taste.direction({ ...get().input, direction })
    set(r.ok ? { busy: null, sheet: r.value } : { busy: null, error: r.message })
  },
  async runCheck(frameId) {
    const doc = docStore.getState().doc
    const node = findNode(doc, frameId)?.node
    if (!node) return
    set({ busy: 'check', error: null })
    const result = await window.maquette.taste.check(doc, frameId, get().allow)
    if (!result) set({ busy: null, error: 'Contrôle impossible : élément masqué ou rendu trop long.' })
    else set({ busy: null, check: { frameId, node, result } })
  },
  toggleRule(id) {
    const allow = get().allow
    set({ allow: allow.includes(id) ? allow.filter((r) => r !== id) : [...allow, id] })
  },
  ignorePageRules() {
    set({ allow: [...new Set([...get().allow, ...PAGE_RULES])] })
    const run = get().check
    if (run) void get().runCheck(run.frameId)
  },
  clearCheck: () => set({ check: null }),
}))

export const useTaste = <T,>(selector: (s: TasteState) => T): T => useStore(tasteStore, selector)

/** Le contrôle porte-t-il encore sur le cadre tel qu'il est ? */
export function isFresh(run: CheckRun | null): boolean {
  if (!run) return false
  return findNode(docStore.getState().doc, run.frameId)?.node === run.node
}
