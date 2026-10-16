import { newDocument } from '../../core/defaults'
import { serializeDocument } from '../../core/format'
import type { MenuCommand } from '../../shared/ipc'
import { openDocument } from './openDocument'
import { docStore } from './store'
import { uiStore } from './ui'

const confirmDiscard = () =>
  !docStore.getState().dirty || window.confirm('Abandonner les modifications non enregistrées ?')

async function save(asNew: boolean): Promise<void> {
  // Un texte en cours d'édition n'est dans le document qu'à sa fermeture : on le valide d'abord.
  if (uiStore.getState().editingTextId) (document.activeElement as HTMLElement | null)?.blur()
  const { doc, filePath } = docStore.getState()
  try {
    const path = await window.maquette.saveFile(asNew ? null : filePath, serializeDocument(doc))
    if (path) docStore.getState().markSaved(path)
  } catch (e) {
    docStore.getState().showError(`Enregistrement impossible : ${(e as Error).message}`)
  }
}

export async function runCommand(cmd: MenuCommand): Promise<void> {
  const store = docStore.getState()
  switch (cmd) {
    case 'new':
      if (confirmDiscard()) {
        await window.maquette.documentLoaded(null)
        store.load(newDocument(), null)
        uiStore.getState().select([])
        uiStore.getState().setEditing(null)
        uiStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
      }
      return
    case 'open': {
      if (!confirmDiscard()) return
      const file = await window.maquette.openFile()
      if (file) await openDocument(file)
      return
    }
    case 'save':
      return save(false)
    case 'save-as':
      return save(true)
    case 'undo':
      store.undo()
      return
    case 'redo':
      store.redo()
      return
  }
}
