import { createStore, useStore } from 'zustand'
import type { Rect } from '../../core/types'
import { union } from '../canvas/geometry'
import { worldRectOf } from '../canvas/rects'

/** Un agent qui travaille dans le document (aujourd'hui un seul : Claude). Son curseur suit ce qu'il touche. */
export interface Agent {
  id: string
  name: string
  color: string
  /** Zone visée, en coordonnées du monde ; null tant qu'il n'a rien touché. */
  target: Rect | null
  /** Dernier appel d'outil (ms) : sans activité, le curseur s'efface. */
  lastActive: number
  /** Une réponse est en cours (chat intégré) : le curseur reste, et « pense » entre deux outils. */
  busy: boolean
}

/** Sans nouvel outil pendant ce temps (et sans réponse en cours), le curseur s'efface. */
export const IDLE_MS = 8000
export const CLAUDE = { id: 'claude', name: 'Claude', color: '#D97757' }

interface AgentState {
  agents: Record<string, Agent>
  /** Un outil vient d'être appelé ; `ids` = éléments qu'il vise (lus, capturés ou modifiés). */
  activity(agentId: string, ids?: string[]): void
  setBusy(agentId: string, busy: boolean): void
  /** Retire les agents inactifs (appelé par l'horloge du calque des curseurs). */
  prune(now: number): void
}

const defaults = (id: string) => (id === CLAUDE.id ? CLAUDE : { id, name: id, color: CLAUDE.color })

/** Zone couverte par les éléments affichés sur la page courante ; ceux d'une autre page sont ignorés. */
function targetOf(ids: string[]): Rect | null {
  const rects = ids.map(worldRectOf).filter((r): r is Rect => !!r && r.width + r.height > 0)
  return rects.length ? union(rects) : null
}

export const agentStore = createStore<AgentState>()((set, get) => ({
  agents: {},
  activity(agentId, ids = []) {
    const prev = get().agents[agentId]
    const base: Agent = prev ?? { ...defaults(agentId), target: null, lastActive: 0, busy: false }
    set({ agents: { ...get().agents, [agentId]: { ...base, lastActive: Date.now() } } })
    if (!ids.length) return
    // Après le rendu : les éléments créés ou déplacés ont alors leur vraie place (minuterie : marche aussi fenêtre masquée).
    setTimeout(() => {
      const target = targetOf(ids)
      const cur = get().agents[agentId]
      if (target && cur) set({ agents: { ...get().agents, [agentId]: { ...cur, target } } })
    }, 40)
  },
  setBusy(agentId, busy) {
    const cur = get().agents[agentId]
    if (busy) {
      const base: Agent = cur ?? { ...defaults(agentId), target: null, lastActive: 0, busy: false }
      set({ agents: { ...get().agents, [agentId]: { ...base, busy: true, lastActive: Date.now() } } })
    } else if (cur) {
      // Réponse finie : le curseur s'efface peu après (le temps de voir la dernière touche).
      set({ agents: { ...get().agents, [agentId]: { ...cur, busy: false, lastActive: Math.min(cur.lastActive, Date.now() - IDLE_MS + 1200) } } })
    }
  },
  prune(now) {
    const agents = get().agents
    const alive = Object.fromEntries(Object.entries(agents).filter(([, a]) => a.busy || now - a.lastActive < IDLE_MS))
    if (Object.keys(alive).length !== Object.keys(agents).length) set({ agents: alive })
  },
}))

export const useAgents = <T>(selector: (s: AgentState) => T): T => useStore(agentStore, selector)
