import { newDocument } from '../../core/defaults'
import { serializeDocument } from '../../core/format'
import type { MenuCommand } from '../../shared/ipc'
import { chatStore } from '../chat/chatStore'
import { ask } from '../dialog/dialogStore'
import { openDocument } from './openDocument'
import { docStore } from './store'
import { uiStore } from './ui'

/** Document modifié : demande avant de le remplacer (Annuler par défaut, rien n'est perdu sur Entrée). */
export const confirmDiscard = async (): Promise<boolean> =>
  !docStore.getState().dirty ||
  (await ask({
    message: 'Abandonner les modifications non enregistrées ?',
    detail: 'Elles seront perdues.',
    buttons: [{ label: 'Annuler' }, { label: 'Abandonner', kind: 'danger' }],
    cancelIndex: 0,
    defaultIndex: 0,
  })) === 1

async function save(asNew: boolean): Promise<boolean> {
  // Un texte en cours d'édition n'est dans le document qu'à sa fermeture : on le valide d'abord.
  if (uiStore.getState().editingTextId) (document.activeElement as HTMLElement | null)?.blur()
  const { doc, filePath } = docStore.getState()
  try {
    const path = await window.maquette.saveFile(asNew ? null : filePath, serializeDocument(doc))
    if (!path) return false
    docStore.getState().markSaved(path)
    return true
  } catch (e) {
    docStore.getState().showError(`Enregistrement impossible : ${(e as Error).message}`)
    return false
  }
}

/** Message d'une erreur renvoyée par le principal, sans le préfixe ajouté par Electron. */
const remoteMessage = (e: unknown) =>
  (e as Error).message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')

async function exportSelection(scale: number): Promise<void> {
  const id = uiStore.getState().selection[0]
  if (!id) {
    docStore.getState().showError('Sélectionnez un élément à exporter')
    return
  }
  // Un texte en cours d'édition n'est dans le document qu'à sa fermeture : on le valide d'abord.
  if (uiStore.getState().editingTextId) (document.activeElement as HTMLElement | null)?.blur()
  try {
    await window.maquette.exportPng(docStore.getState().doc, id, scale)
  } catch (e) {
    docStore.getState().showError(`Export impossible : ${remoteMessage(e)}`)
  }
}

export async function runCommand(cmd: MenuCommand): Promise<void> {
  const store = docStore.getState()
  switch (cmd) {
    case 'new':
      if (await confirmDiscard()) {
        await window.maquette.documentLoaded(null)
        store.load(newDocument(), null)
        uiStore.getState().select([])
        uiStore.getState().setEditing(null)
        uiStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
      }
      return
    case 'open': {
      if (!(await confirmDiscard())) return
      const file = await window.maquette.openFile()
      if (file) await openDocument(file)
      return
    }
    case 'save':
      await save(false)
      return
    case 'save-as':
      await save(true)
      return
    case 'save-and-close':
      // Question de la fermeture : « Enregistrer ». Annulé ou raté, la fenêtre reste ouverte.
      if (await save(false)) window.maquette.closeWindow()
      return
    case 'undo':
      store.undo()
      return
    case 'redo':
      store.redo()
      return
    case 'export-png-1':
      return exportSelection(1)
    case 'export-png-2':
      return exportSelection(2)
    case 'export-png-3':
      return exportSelection(3)
    case 'toggle-chat':
      chatStore.getState().toggle()
      return
  }
}
