import { newDocument } from '../../core/defaults'
import { serializeDocument } from '../../core/format'
import type { FileHost } from '../../mcp/tools'
import { homeStore } from '../home/homeStore'
import { openDocument } from '../state/openDocument'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'

/** L'app tourne sans fenêtre visible (lancée par Claude Code, app fermée) : voir le paramètre posé par le principal. */
export const headless = () => new URLSearchParams(location.search).get('headless') === '1'

const failed = (message: string) => ({ ok: false as const, message })

/**
 * Avant de remplacer le document affiché : un fichier modifié est d'abord enregistré, un document jamais
 * enregistré et modifié n'est jamais perdu (refus expliqué à Claude).
 */
async function keepCurrent(): Promise<string | null> {
  const { dirty, filePath, doc } = docStore.getState()
  if (!dirty) return null
  if (!filePath) return 'le document ouvert n’a jamais été enregistré et contient des modifications : enregistre-le d’abord (fichier enregistrer {chemin}) ou demande à l’utilisateur'
  const path = await window.maquette.saveFile(filePath, serializeDocument(doc), { silent: true })
  if (!path) return `impossible d’enregistrer ${filePath} avant de le quitter`
  if (docStore.getState().doc === doc) docStore.getState().markSaved(path)
  return null
}

/** Outil fichier de Claude : ouvrir, créer, enregistrer, sans boîte de dialogue. */
export const fileHost: FileHost = {
  state() {
    const { filePath, dirty } = docStore.getState()
    return { chemin: filePath, modifie: dirty, visible: !headless() }
  },

  async open(path) {
    const blocked = await keepCurrent()
    if (blocked) return failed(blocked)
    const file = await window.maquette.mcpFile.read(path)
    if ('error' in file) return failed(file.error)
    if (!(await openDocument(file))) return failed(docStore.getState().notice ?? `impossible d’ouvrir ${path}`)
    return { ok: true, chemin: file.path! }
  },

  async create(path, replace) {
    const blocked = await keepCurrent()
    if (blocked) return failed(blocked)
    // Avec un chemin : le fichier vide est d'abord écrit (refus avant de toucher au document affiché), puis ouvert.
    if (path) {
      const written = await window.maquette.mcpFile.saveAs(path, serializeDocument(newDocument()), replace === true, true)
      if ('error' in written) return failed(written.error)
      const file = await window.maquette.mcpFile.read(written.path)
      if ('error' in file) return failed(file.error)
      if (!(await openDocument(file))) return failed(`impossible d’ouvrir ${written.path}`)
      return { ok: true, chemin: written.path }
    }
    await window.maquette.documentLoaded(null)
    docStore.getState().load(newDocument(), null)
    uiStore.getState().select([])
    uiStore.getState().setEditing(null)
    uiStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
    homeStore.getState().documentShown()
    return { ok: true, chemin: null }
  },

  async save(path, replace) {
    // Un texte en cours d'édition n'est dans le document qu'à sa fermeture : on le valide d'abord.
    if (uiStore.getState().editingTextId) (document.activeElement as HTMLElement | null)?.blur()
    const { doc, filePath } = docStore.getState()
    const text = serializeDocument(doc)
    if (!path) {
      if (!filePath) return failed('document jamais enregistré : donne un chemin (fichier enregistrer {chemin})')
      const saved = await window.maquette.saveFile(filePath, text, { silent: true })
      if (!saved) return failed(`impossible d’enregistrer ${filePath}`)
      if (docStore.getState().doc === doc) docStore.getState().markSaved(saved)
      return { ok: true, chemin: saved }
    }
    const r = await window.maquette.mcpFile.saveAs(path, text, replace === true)
    if ('error' in r) return failed(r.error)
    if (docStore.getState().doc === doc) docStore.getState().markSaved(r.path)
    else docStore.setState({ filePath: r.path })
    return { ok: true, chemin: r.path }
  },
}
