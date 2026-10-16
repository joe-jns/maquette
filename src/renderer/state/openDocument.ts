import { parseDocument } from '../../core/format'
import type { OpenedFile } from '../../shared/ipc'
import { docStore } from './store'
import { uiStore } from './ui'

export const fileName = (path: string | null) => (path ? (path.split(/[\\/]/).pop() ?? path) : 'Sans titre')

/** Charge un fichier lu sur disque : refus expliqué, ou ouverture avec les réparations signalées. */
export async function openDocument(file: OpenedFile): Promise<void> {
  const store = docStore.getState()
  const parsed = parseDocument(file.text)
  if (!parsed.ok) {
    store.showError(`Impossible d’ouvrir ${fileName(file.path)} : ${parsed.errors[0]!.message}`)
    return
  }
  // D'abord le principal (dossier des images), ensuite l'affichage : sinon les images partent trop tôt.
  await window.maquette.documentLoaded(file.path)
  store.load(parsed.doc, file.path)
  uiStore.getState().select([])
  uiStore.getState().requestFit()
  const n = parsed.warnings.length
  if (n > 0) {
    // Le document réparé diffère du fichier : il reste à enregistrer.
    docStore.setState({ dirty: true })
    store.showError(
      `${fileName(file.path)} ouvert avec ${n} réparation${n > 1 ? 's' : ''} : ${parsed.warnings[0]!.message}`,
    )
  }
}
