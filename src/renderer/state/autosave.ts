import { serializeDocument } from '../../core/format'
import type { MaquetteDocument } from '../../core/types'
import { docName } from './openDocument'
import { docStore } from './store'
import { uiStore } from './ui'

const EVERY_MS = 5000

/**
 * Copie de secours toutes les 5 s tant qu'il y a des changements (le fichier de l'utilisateur n'est
 * touché qu'à l'enregistrement), et état « modifié » tenu à jour pour la question à la fermeture.
 */
export function startAutosave(): () => void {
  let saved: MaquetteDocument | null = null
  let writing = false

  const tick = async () => {
    const { doc, dirty, filePath } = docStore.getState()
    if (!dirty || doc === saved || writing) return
    writing = true
    try {
      await window.maquette.backup.write(filePath, serializeDocument(doc))
      saved = doc
    } catch {
      // Disque plein ou verrouillé : on réessaiera au prochain tour.
    } finally {
      writing = false
    }
  }
  const timer = setInterval(() => void tick(), EVERY_MS)

  // Un texte en cours de frappe n'est dans le document qu'à sa validation : il compte comme un changement.
  const report = () => {
    const { dirty, filePath, untitledName } = docStore.getState()
    const typing = uiStore.getState().editingTextId !== null
    window.maquette.docState({ dirty: dirty || typing, name: docName({ filePath, untitledName }), path: filePath })
  }
  report()
  const unsubscribeUi = uiStore.subscribe((s, prev) => s.editingTextId !== prev.editingTextId && report())
  const unsubscribe = docStore.subscribe((state, prev) => {
    if (state.dirty !== prev.dirty || state.filePath !== prev.filePath) report()
    // Enregistré, ou document remplacé (Nouveau, Ouvrir) : la copie de l'ancien n'a plus lieu d'être.
    if ((prev.dirty && !state.dirty) || state.filePath !== prev.filePath) {
      saved = null
      void window.maquette.backup.clear(prev.filePath)
    }
  })

  return () => {
    clearInterval(timer)
    unsubscribe()
    unsubscribeUi()
  }
}
