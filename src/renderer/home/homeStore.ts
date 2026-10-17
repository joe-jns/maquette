import { createStore, useStore } from 'zustand'

interface HomeState {
  /** L'accueil est affiché (à la place de l'éditeur). */
  open: boolean
  /** Un document a déjà été affiché : Échap ou « Retour » y ramène. Faux au lancement sans fichier. */
  hasDocument: boolean
  /** Montre l'accueil (Fichier → Accueil). */
  show(): void
  /** Un document vient d'être ouvert ou créé : l'éditeur reprend la place. */
  documentShown(): void
  /** Quitte l'accueil sans rien choisir : seulement s'il y a un document à retrouver. */
  back(): void
}

export const homeStore = createStore<HomeState>()((set, get) => ({
  open: false,
  hasDocument: false,
  show: () => set({ open: true }),
  documentShown: () => set({ open: false, hasDocument: true }),
  back: () => {
    if (get().hasDocument) set({ open: false })
  },
}))

export function useHome<T>(selector: (s: HomeState) => T): T {
  return useStore(homeStore, selector)
}
