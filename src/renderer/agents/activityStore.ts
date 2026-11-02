import { createStore, useStore } from 'zustand'

interface ActivityState {
  /** Une réponse du chat intégré est en cours. */
  busy: boolean
  /** Appels d'outil en cours (chat intégré ou Claude Code extérieur). */
  running: number
  /** Fin du dernier appel d'outil (ms). */
  lastTool: number
  setBusy(busy: boolean): void
  toolStarted(): void
  toolEnded(): void
}

export const activityStore = createStore<ActivityState>()((set, get) => ({
  busy: false,
  running: 0,
  lastTool: 0,
  setBusy: (busy) => set({ busy }),
  toolStarted: () => set({ running: get().running + 1 }),
  toolEnded: () => set({ running: Math.max(0, get().running - 1), lastTool: Date.now() }),
}))

export const useActivity = <T>(selector: (s: ActivityState) => T): T => useStore(activityStore, selector)
