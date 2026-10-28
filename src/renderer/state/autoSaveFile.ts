import { createStore, useStore } from 'zustand'
import { serializeDocument } from '../../core/format'
import { docStore } from './store'
import { uiStore } from './ui'

/** Pause après la dernière modification avant d'enregistrer. */
const QUIET_MS = 2000
/** Modifications en continu (Claude qui construit une page) : on enregistre quand même au moins aussi souvent. */
const MAX_WAIT_MS = 10_000
const PREF_KEY = 'maquette.autoSave'

function readPref(): boolean {
  try {
    return globalThis.localStorage?.getItem(PREF_KEY) !== '0'
  } catch {
    return true
  }
}

/** Préférence « Auto-save » (activée par défaut), gardée d'une session à l'autre. */
export const autoSaveStore = createStore<{ enabled: boolean; toggle(): void }>()((set, get) => ({
  enabled: readPref(),
  toggle() {
    const enabled = !get().enabled
    try {
      globalThis.localStorage?.setItem(PREF_KEY, enabled ? '1' : '0')
    } catch {
      /* stockage indisponible : la préférence vaut pour la session */
    }
    set({ enabled })
  },
}))
export const useAutoSave = () => useStore(autoSaveStore, (s) => s.enabled)

/**
 * Enregistre le fichier tout seul quelques secondes après chaque modification, sans jamais ouvrir de boîte
 * de dialogue : un document jamais enregistré reste en copie de secours jusqu'au premier « Save as ».
 * Attend la fin d'un geste (glisser, redimensionner) et d'une saisie de texte.
 */
export function startAutoSaveFile(): () => void {
  let quiet: ReturnType<typeof setTimeout> | null = null
  let firstChange = 0
  let writing = false
  let failed = false

  const run = async () => {
    quiet = null
    const { doc, dirty, filePath, inGesture } = docStore.getState()
    if (!autoSaveStore.getState().enabled || !dirty || !filePath) return
    if (writing || inGesture || uiStore.getState().editingTextId) {
      schedule()
      return
    }
    writing = true
    try {
      const path = await window.maquette.saveFile(filePath, serializeDocument(doc), { silent: true })
      // Modifié pendant l'écriture : reste « modifié », le prochain tour enregistrera la suite.
      if (path && docStore.getState().doc === doc && docStore.getState().filePath === filePath) docStore.getState().markSaved(path)
      failed = false
      firstChange = 0
    } catch (e) {
      // Une seule alerte par série d'échecs (disque plein, fichier verrouillé) ; on réessaie aux modifications suivantes.
      if (!failed) docStore.getState().showError(`Auto-save failed: ${(e as Error).message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')}`)
      failed = true
    } finally {
      writing = false
    }
  }

  function schedule() {
    const now = Date.now()
    if (!firstChange) firstChange = now
    if (quiet) clearTimeout(quiet)
    const wait = Math.max(0, Math.min(QUIET_MS, firstChange + MAX_WAIT_MS - now))
    quiet = setTimeout(() => void run(), wait)
  }

  const offDoc = docStore.subscribe((s, prev) => {
    if (s.doc !== prev.doc && s.dirty && s.filePath) schedule()
  })
  // Fin d'une saisie de texte ou d'un geste : ce qui attendait part.
  const offUi = uiStore.subscribe((s, prev) => {
    if (prev.editingTextId && !s.editingTextId && docStore.getState().dirty) schedule()
  })
  const offPref = autoSaveStore.subscribe((s, prev) => {
    if (s.enabled && !prev.enabled && docStore.getState().dirty) schedule()
  })
  return () => {
    if (quiet) clearTimeout(quiet)
    offDoc()
    offUi()
    offPref()
  }
}
