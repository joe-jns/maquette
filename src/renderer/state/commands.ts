import { newDocument } from '../../core/defaults'
import { serializeDocument } from '../../core/format'
import type { MenuCommand } from '../../shared/ipc'
import { chatStore } from '../chat/chatStore'
import { homeStore } from '../home/homeStore'
import { ask } from '../dialog/dialogStore'
import { autoSaveStore } from './autoSaveFile'
import { openDocument } from './openDocument'
import { docStore } from './store'
import { uiStore } from './ui'

/** Document modifié : demande avant de le remplacer (Annuler par défaut, rien n'est perdu sur Entrée). */
export const confirmDiscard = async (): Promise<boolean> =>
  !docStore.getState().dirty ||
  (await ask({
    message: 'Discard unsaved changes?',
    detail: 'They will be lost.',
    buttons: [{ label: 'Cancel' }, { label: 'Discard', kind: 'danger' }],
    cancelIndex: 0,
    defaultIndex: 0,
  })) === 1

/** Réponse à « Enregistrer avant de quitter ce document ? ». */
export type LeaveChoice = 'clean' | 'saved' | 'discard' | 'cancel'

/**
 * Avant de quitter le document (accueil, nouveau, ouvrir) : un fichier avec l'enregistrement automatique est
 * enregistré sans question ; sinon on demande Enregistrer / Ne pas enregistrer / Annuler, comme à la fermeture.
 */
export async function askLeave(): Promise<LeaveChoice> {
  const { dirty, filePath } = docStore.getState()
  if (!dirty) return 'clean'
  if (filePath && autoSaveStore.getState().enabled && (await save(false, true))) return 'saved'
  const name = filePath ? filePath.split(/[\\/]/).pop()!.replace(/\.maquette$/i, '') : 'Untitled'
  const answer = await ask({
    message: `Save changes to ${name}?`,
    detail: 'Your changes will be lost if you don’t save them.',
    buttons: [{ label: 'Save', kind: 'primary' }, { label: 'Don’t save', kind: 'danger' }, { label: 'Cancel' }],
    defaultIndex: 0,
    cancelIndex: 2,
  })
  if (answer === 1) return 'discard'
  // « Enregistrer » annulé (boîte « Enregistrer sous » fermée) ou raté : on reste sur le document.
  if (answer === 0 && (await save(false))) return 'saved'
  return 'cancel'
}

/** Vrai si l'on peut quitter le document : déjà enregistré, enregistré à l'instant, ou abandonné. */
export const confirmLeave = async (): Promise<boolean> => (await askLeave()) !== 'cancel'

async function save(asNew: boolean, silent = false): Promise<boolean> {
  // Un texte en cours d'édition n'est dans le document qu'à sa fermeture : on le valide d'abord.
  if (uiStore.getState().editingTextId) (document.activeElement as HTMLElement | null)?.blur()
  const { doc, filePath } = docStore.getState()
  try {
    const path = await window.maquette.saveFile(asNew ? null : filePath, serializeDocument(doc), silent ? { silent: true } : undefined)
    if (!path) return false
    if (!silent || docStore.getState().doc === doc) docStore.getState().markSaved(path)
    return true
  } catch (e) {
    docStore.getState().showError(`Could not save: ${(e as Error).message}`)
    return false
  }
}

/** Message d'une erreur renvoyée par le principal, sans le préfixe ajouté par Electron. */
const remoteMessage = (e: unknown) =>
  (e as Error).message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')

async function exportSelection(scale: number): Promise<void> {
  const id = uiStore.getState().selection[0]
  if (!id) {
    docStore.getState().showError('Select a layer to export')
    return
  }
  // Un texte en cours d'édition n'est dans le document qu'à sa fermeture : on le valide d'abord.
  if (uiStore.getState().editingTextId) (document.activeElement as HTMLElement | null)?.blur()
  try {
    await window.maquette.exportPng(docStore.getState().doc, id, scale)
  } catch (e) {
    docStore.getState().showError(`Could not export: ${remoteMessage(e)}`)
  }
}

export async function runCommand(cmd: MenuCommand): Promise<void> {
  const store = docStore.getState()
  switch (cmd) {
    case 'new':
      if (await confirmLeave()) {
        await window.maquette.documentLoaded(null)
        store.load(newDocument(), null)
        uiStore.getState().select([])
        uiStore.getState().setEditing(null)
        uiStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
        homeStore.getState().documentShown()
      }
      return
    case 'home': {
      const choice = await askLeave()
      if (choice === 'cancel') return
      // Changements abandonnés : le document quitte la mémoire, l'accueil n'a plus de « Retour ».
      if (choice === 'discard') {
        await window.maquette.documentLoaded(null)
        store.load(newDocument(), null)
        uiStore.getState().select([])
        uiStore.getState().setEditing(null)
        homeStore.setState({ hasDocument: false })
      }
      homeStore.getState().show()
      return
    }
    case 'open': {
      if (!(await confirmLeave())) return
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
